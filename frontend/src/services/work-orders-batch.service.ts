import api from './api';
import type { ApiResponse } from '../types';

/** B55 — one action applied to a selection of work orders. */
export type BatchAction = 'ASSIGN' | 'DISPATCH' | 'UNASSIGN' | 'CANCEL' | 'SCHEDULE';

export interface BatchWorkOrdersDto {
  ids: string[];
  action: BatchAction;
  technicianId?: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  reason?: string;
  note?: string;
}

export interface BatchResult {
  action: BatchAction;
  ok: Array<{ id: string; referenceNumber: string }>;
  failed: Array<{ id: string; referenceNumber: string | null; error: string }>;
}

export async function runBatch(dto: BatchWorkOrdersDto): Promise<BatchResult> {
  const { data } = await api.post<ApiResponse<BatchResult>>('/work-orders/batch', dto);
  return data.data;
}
