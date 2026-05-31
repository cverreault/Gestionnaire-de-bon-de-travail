import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import processService, {
  CreateProcessDefinitionPayload,
  UpdateProcessDefinitionPayload,
  CreateProcessStatusPayload,
  UpdateProcessStatusPayload,
  CreateProcessTransitionPayload,
  UpdateProcessTransitionPayload,
  ProcessListParams,
} from '../services/process.service';

export const PROCESSES_KEY = 'processes';

// ─── Process Definitions ──────────────────────────────────────────────────────

export function useProcesses(params?: ProcessListParams) {
  return useQuery({
    queryKey: [PROCESSES_KEY, params],
    queryFn: () => processService.findAll(params),
  });
}

export function useProcess(id: string) {
  return useQuery({
    queryKey: [PROCESSES_KEY, id],
    queryFn: () => processService.findOne(id),
    enabled: !!id,
  });
}

export function useCreateProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateProcessDefinitionPayload) => processService.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY] });
    },
  });
}

export function useUpdateProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProcessDefinitionPayload }) =>
      processService.update(id, data),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY, id] });
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY] });
    },
  });
}

export function useDeleteProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => processService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY] });
    },
  });
}

// ─── Statuses ─────────────────────────────────────────────────────────────────

export function useAddProcessStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      processId,
      data,
    }: {
      processId: string;
      data: CreateProcessStatusPayload;
    }) => processService.addStatus(processId, data),
    onSuccess: (_result, { processId }) => {
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY, processId] });
    },
  });
}

export function useUpdateProcessStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      processId,
      statusId,
      data,
    }: {
      processId: string;
      statusId: string;
      data: UpdateProcessStatusPayload;
    }) => processService.updateStatus(processId, statusId, data),
    onSuccess: (_result, { processId }) => {
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY, processId] });
    },
  });
}

export function useDeleteProcessStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      processId,
      statusId,
    }: {
      processId: string;
      statusId: string;
    }) => processService.removeStatus(processId, statusId),
    onSuccess: (_result, { processId }) => {
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY, processId] });
    },
  });
}

// ─── Transitions ──────────────────────────────────────────────────────────────

export function useAddProcessTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      processId,
      data,
    }: {
      processId: string;
      data: CreateProcessTransitionPayload;
    }) => processService.addTransition(processId, data),
    onSuccess: (_result, { processId }) => {
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY, processId] });
    },
  });
}

export function useUpdateProcessTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      processId,
      transitionId,
      data,
    }: {
      processId: string;
      transitionId: string;
      data: UpdateProcessTransitionPayload;
    }) => processService.updateTransition(processId, transitionId, data),
    onSuccess: (_result, { processId }) => {
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY, processId] });
    },
  });
}

export function useDeleteProcessTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      processId,
      transitionId,
    }: {
      processId: string;
      transitionId: string;
    }) => processService.removeTransition(processId, transitionId),
    onSuccess: (_result, { processId }) => {
      qc.invalidateQueries({ queryKey: [PROCESSES_KEY, processId] });
    },
  });
}
