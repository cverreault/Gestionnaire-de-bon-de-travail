import type { WorkOrder } from '../types';

export type DispatchSort = 'time' | 'priority' | 'type' | 'reference';

const when = (w: WorkOrder) => w.scheduledStartTime ?? w.scheduledDate ?? '9';

/** Pure ordering of a dispatch column. */
export function sortDispatchRows(rows: WorkOrder[], sort: DispatchSort): WorkOrder[] {
  const copy = [...rows];
  switch (sort) {
    case 'priority':
      return copy.sort((a, b) => b.priority - a.priority || when(a).localeCompare(when(b)));
    case 'type':
      return copy.sort((a, b) => (a.taskType?.name ?? a.type).localeCompare(b.taskType?.name ?? b.type) || a.referenceNumber.localeCompare(b.referenceNumber));
    case 'reference':
      return copy.sort((a, b) => a.referenceNumber.localeCompare(b.referenceNumber));
    default:
      return copy.sort((a, b) => when(a).localeCompare(when(b)));
  }
}

/** Splits work orders into the « unassigned » column and one bucket per technician id. */
export function groupByTechnician(rows: WorkOrder[]): { unassigned: WorkOrder[]; byTech: Map<string, WorkOrder[]> } {
  const byTech = new Map<string, WorkOrder[]>();
  const unassigned: WorkOrder[] = [];
  for (const wo of rows) {
    if (wo.assignedToId) {
      const arr = byTech.get(wo.assignedToId) ?? [];
      arr.push(wo);
      byTech.set(wo.assignedToId, arr);
    } else {
      unassigned.push(wo);
    }
  }
  return { unassigned, byTech };
}

/** Active work-order count per technician + unassigned total (technician panel badges). */
export function countByTechnician(rows: Array<Pick<WorkOrder, 'assignedToId'>>): { counts: Record<string, number>; unassigned: number } {
  const counts: Record<string, number> = {};
  let unassigned = 0;
  for (const wo of rows) {
    if (wo.assignedToId) counts[wo.assignedToId] = (counts[wo.assignedToId] ?? 0) + 1;
    else unassigned += 1;
  }
  return { counts, unassigned };
}
