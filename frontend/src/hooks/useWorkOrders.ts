import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import workOrdersService, {
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
  TransitionDynamicDto,
} from '../services/work-orders.service';
import api from '../services/api';
import { offlineStore } from '../services/offline-store';
import type { WorkOrderFilters, WorkOrderStatus } from '../types';

export const WORK_ORDERS_KEY = 'work-orders';

export function useWorkOrders(filters?: WorkOrderFilters) {
  return useQuery({
    queryKey: [WORK_ORDERS_KEY, filters],
    queryFn: () => workOrdersService.findAll(filters),
  });
}

export function useMyWorkOrders(filters?: WorkOrderFilters) {
  const query = useQuery({
    queryKey: [WORK_ORDERS_KEY, 'my', filters],
    queryFn: () => workOrdersService.getMyWorkOrders(filters),
  });

  // Cache results in IndexedDB after every successful fetch for offline use
  useEffect(() => {
    if (query.data?.data && query.data.data.length > 0) {
      offlineStore.cacheWorkOrders(query.data.data).catch(console.error);
    }
  }, [query.data]);

  return query;
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: [WORK_ORDERS_KEY, id],
    queryFn: () => workOrdersService.findOne(id),
    enabled: !!id,
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateWorkOrderDto) => workOrdersService.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
    },
  });
}

export function useUpdateWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateWorkOrderDto) => workOrdersService.update(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY, id] });
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
    },
  });
}

/**
 * Legacy status-based transition payload (status enum + optional fields).
 * Both this shape and TransitionDynamicDto (targetStepId) are accepted by
 * POST /work-orders/:id/transition — same endpoint, two payload conventions.
 */
export interface LegacyTransitionDto {
  status: WorkOrderStatus;
  assignedToId?: string;
  negativeReason?: string;
  completionNotes?: string;
  reopenReason?: string;
}

export function useUpdateWorkOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: LegacyTransitionDto) =>
      workOrdersService.transitionDynamic(id, dto as unknown as TransitionDynamicDto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY, id] });
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
    },
  });
}

export function useDispatchWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignedToId: string) =>
      workOrdersService.transitionDynamic(
        id,
        { status: 'DISPATCHED', assignedToId } as unknown as TransitionDynamicDto,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY, id] });
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
    },
  });
}

export function useAddNote(workOrderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => workOrdersService.addNote(workOrderId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY, workOrderId] });
    },
  });
}

export function useUploadAttachment(workOrderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => workOrdersService.uploadAttachment(workOrderId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY, workOrderId] });
    },
  });
}

/**
 * Assign a work order to a technician AND dispatch it in one API call.
 * Used by the sidebar DnD drop gesture.
 * Endpoint: POST /work-orders/:id/assign-and-dispatch
 */
export function useAssignAndDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workOrderId,
      technicianId,
    }: {
      workOrderId: string;
      technicianId: string;
    }) =>
      api.post(`/work-orders/${workOrderId}/assign-and-dispatch`, { technicianId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
    },
  });
}
