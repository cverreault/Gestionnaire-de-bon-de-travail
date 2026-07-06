import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addWorkOrderPart,
  adjustStock,
  createPart,
  deletePart,
  getMyStock,
  getPartMovements,
  getParts,
  getPartsCatalog,
  getStockByTechnician,
  getWorkOrderParts,
  receiveStock,
  removeWorkOrderPart,
  transferStock,
  updatePart,
  type CreatePartDto,
  type UpdatePartDto,
} from '../services/parts.service';

const PARTS_KEY = 'parts';
const WO_PARTS_KEY = 'work-order-parts';

export function useParts(search?: string, includeInactive = false) {
  return useQuery({
    queryKey: [PARTS_KEY, { search, includeInactive }],
    queryFn: () => getParts(search, includeInactive),
  });
}

export function usePartsCatalog(enabled = true) {
  return useQuery({
    queryKey: [PARTS_KEY, 'catalog'],
    queryFn: getPartsCatalog,
    staleTime: 60_000,
    enabled,
  });
}

export function useStockByTechnician() {
  return useQuery({
    queryKey: [PARTS_KEY, 'by-technician'],
    queryFn: getStockByTechnician,
  });
}

export function usePartMovements(partId: string | null) {
  return useQuery({
    queryKey: [PARTS_KEY, 'movements', partId],
    queryFn: () => getPartMovements(partId!),
    enabled: !!partId,
  });
}

export function useMyStock() {
  return useQuery({ queryKey: [PARTS_KEY, 'mine'], queryFn: getMyStock });
}

function useInvalidateParts() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [PARTS_KEY] });
}

export function useCreatePart() {
  const invalidate = useInvalidateParts();
  return useMutation({
    mutationFn: (dto: CreatePartDto) => createPart(dto),
    onSuccess: invalidate,
  });
}

export function useUpdatePart() {
  const invalidate = useInvalidateParts();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePartDto }) => updatePart(id, dto),
    onSuccess: invalidate,
  });
}

export function useDeletePart() {
  const invalidate = useInvalidateParts();
  return useMutation({ mutationFn: (id: string) => deletePart(id), onSuccess: invalidate });
}

export function useStockOperation() {
  const invalidate = useInvalidateParts();
  return useMutation({
    mutationFn: (op:
      | { kind: 'receive'; partId: string; quantity: number; note?: string }
      | { kind: 'adjust'; partId: string; quantity: number; note: string; technicianId?: string }
      | { kind: 'transfer'; partId: string; technicianId: string; quantity: number; direction: 'TO_TECH' | 'TO_WAREHOUSE' },
    ) => {
      if (op.kind === 'receive') return receiveStock(op.partId, op.quantity, op.note);
      if (op.kind === 'adjust') return adjustStock(op.partId, op.quantity, op.note, op.technicianId);
      return transferStock(op.partId, op.technicianId, op.quantity, op.direction);
    },
    onSuccess: invalidate,
  });
}

export function useWorkOrderParts(workOrderId: string) {
  return useQuery({
    queryKey: [WO_PARTS_KEY, workOrderId],
    queryFn: () => getWorkOrderParts(workOrderId),
    enabled: !!workOrderId,
  });
}

export function useAddWorkOrderPart(workOrderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { partId: string; quantity: number; source?: 'WAREHOUSE' | 'TECHNICIAN_STOCK' }) =>
      addWorkOrderPart(workOrderId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WO_PARTS_KEY, workOrderId] });
      qc.invalidateQueries({ queryKey: [PARTS_KEY] });
    },
  });
}

export function useRemoveWorkOrderPart(workOrderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) => removeWorkOrderPart(workOrderId, rowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WO_PARTS_KEY, workOrderId] });
      qc.invalidateQueries({ queryKey: [PARTS_KEY] });
    },
  });
}
