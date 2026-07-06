import api from './api';
import type { ApiResponse } from '../types';

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurringWorkOrder {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  taskTypeId: string;
  clientId: string;
  clientAddressId: string | null;
  assignedToId: string | null;
  workOrderTitle: string;
  workOrderDescription: string;
  priority: number;
  frequency: Frequency;
  interval: number;
  byDayOfWeek: number[];
  byDayOfMonth: number[];
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  spawnedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringInput {
  name: string;
  description?: string;
  isActive?: boolean;
  taskTypeId: string;
  clientId: string;
  clientAddressId?: string | null;
  assignedToId?: string | null;
  workOrderTitle?: string;
  workOrderDescription?: string;
  priority?: number;
  frequency: Frequency;
  interval?: number;
  byDayOfWeek?: number[];
  byDayOfMonth?: number[];
  startDate: string;
  endDate?: string | null;
}

export type UpdateRecurringInput = Partial<CreateRecurringInput>;

const BASE = '/recurring-work-orders';

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export async function listRecurring(): Promise<RecurringWorkOrder[]> {
  const { data } = await api.get<ApiResponse<RecurringWorkOrder[]>>(BASE);
  return unwrap<RecurringWorkOrder[]>(data);
}

export async function createRecurring(input: CreateRecurringInput): Promise<RecurringWorkOrder> {
  const { data } = await api.post<ApiResponse<RecurringWorkOrder>>(BASE, input);
  return unwrap<RecurringWorkOrder>(data);
}

export async function updateRecurring(
  id: string,
  input: UpdateRecurringInput,
): Promise<RecurringWorkOrder> {
  const { data } = await api.patch<ApiResponse<RecurringWorkOrder>>(`${BASE}/${id}`, input);
  return unwrap<RecurringWorkOrder>(data);
}

export async function deleteRecurring(id: string): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}

/** Returns the next N ISO timestamps the schedule would produce. */
export async function previewRecurring(
  input: CreateRecurringInput,
  count = 5,
): Promise<string[]> {
  const { data } = await api.post<ApiResponse<{ data: string[] }>>(
    `${BASE}/preview?count=${count}`,
    input,
  );
  // Preview returns { data: string[] } already wrapped by controller → unwrap twice.
  const first = unwrap<{ data: string[] } | string[]>(data);
  if (Array.isArray(first)) return first;
  return first.data;
}
