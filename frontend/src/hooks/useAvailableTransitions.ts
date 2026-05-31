import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import workOrdersService, { TransitionDynamicDto } from '../services/work-orders.service';
import { WORK_ORDERS_KEY } from './useWorkOrders';

export const AVAILABLE_TRANSITIONS_KEY = 'available-transitions';

/**
 * Fetches the available process-engine transitions for a given work order.
 * The query is skipped when workOrderId is empty.
 */
export function useAvailableTransitions(workOrderId: string) {
  return useQuery({
    queryKey: [AVAILABLE_TRANSITIONS_KEY, workOrderId],
    queryFn: () => workOrdersService.getAvailableTransitions(workOrderId),
    enabled: !!workOrderId,
    // Reasonably short staleTime — transitions can change after each mutation
    staleTime: 30_000,
  });
}

/**
 * Executes a process-engine transition (POST /work-orders/:id/transition).
 * After success it invalidates:
 *   - the work order detail cache (to refresh currentStep)
 *   - the available-transitions cache for the same work order
 *   - the global work-orders list cache
 */
export function useExecuteTransition(workOrderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: TransitionDynamicDto) =>
      workOrdersService.transitionDynamic(workOrderId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY, workOrderId] });
      qc.invalidateQueries({ queryKey: [AVAILABLE_TRANSITIONS_KEY, workOrderId] });
      qc.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
    },
  });
}
