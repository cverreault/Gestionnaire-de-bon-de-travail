import { WorkOrderStatus } from '@prisma/client';

/**
 * Defines all valid status transitions for a WorkOrder.
 *
 * Business rules:
 *  - CREATED            → ASSIGNED           (requires assignedToId)
 *  - ASSIGNED           → DISPATCHED         (push-to-mobile / dispatch action)
 *  - ASSIGNED           → CREATED            (remove assignment)
 *  - DISPATCHED         → EN_ROUTE           (technician is on the way)
 *  - EN_ROUTE           → IN_PROGRESS        (technician starts the job)
 *  - IN_PROGRESS        → COMPLETED_POSITIVE
 *  - IN_PROGRESS        → COMPLETED_NEGATIVE (negativeReason required)
 *  - COMPLETED_NEGATIVE → CREATED            (re-open a failed work order)
 *  - COMPLETED_POSITIVE → CREATED            (admin re-opens a completed work order;
 *                                             reopenReason is required and only ADMIN role
 *                                             is authorised to perform this transition)
 */
export type TransitionMap = Record<WorkOrderStatus, WorkOrderStatus[]>;

export const VALID_TRANSITIONS: TransitionMap = {
  [WorkOrderStatus.CREATED]: [WorkOrderStatus.ASSIGNED],
  [WorkOrderStatus.ASSIGNED]: [WorkOrderStatus.DISPATCHED, WorkOrderStatus.CREATED],
  [WorkOrderStatus.DISPATCHED]: [WorkOrderStatus.EN_ROUTE],
  [WorkOrderStatus.EN_ROUTE]: [WorkOrderStatus.IN_PROGRESS],
  [WorkOrderStatus.IN_PROGRESS]: [
    WorkOrderStatus.COMPLETED_POSITIVE,
    WorkOrderStatus.COMPLETED_NEGATIVE,
  ],
  // COMPLETED_POSITIVE is no longer strictly terminal: admins may re-open with a reason.
  [WorkOrderStatus.COMPLETED_POSITIVE]: [WorkOrderStatus.CREATED],
  [WorkOrderStatus.COMPLETED_NEGATIVE]: [WorkOrderStatus.CREATED],
};

/**
 * Returns true when transitioning from `from` to `to` is allowed.
 */
export function isValidTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
