import api from './api';
import type { ApiResponse } from '../types';

/**
 * Tenant admin CRUD for alert rules (B10).
 *
 * Backed by `/api/tenant/alerts`. ADMIN role — sidebar entry hidden for
 * other roles and the backend enforces the guard regardless.
 */

export interface AlertRuleRow {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  eventName: string;
  processDefinitionId: string | null;
  fromStatusId: string | null;
  toStatusId: string | null;
  taskTypeIds: string[];
  templateIds: string[];
  clientTypeCodes: string[];
  addressTypeCodes: string[];
  priorityIn: string[];
  recipientRoles: string[];
  recipientUserIds: string[];
  recipientAssignedTechnician: boolean;
  recipientClient: boolean;
  channels: string[];
  titleTemplate: string;
  bodyTemplate: string;
  clientTitleTemplate: string | null;
  clientBodyTemplate: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertRuleInput {
  name: string;
  description?: string;
  isActive?: boolean;
  eventName: string;
  processDefinitionId?: string | null;
  fromStatusId?: string | null;
  toStatusId?: string | null;
  taskTypeIds?: string[];
  templateIds?: string[];
  clientTypeCodes?: string[];
  addressTypeCodes?: string[];
  priorityIn?: string[];
  recipientRoles?: string[];
  recipientUserIds?: string[];
  recipientAssignedTechnician?: boolean;
  recipientClient?: boolean;
  channels: string[];
  titleTemplate: string;
  bodyTemplate: string;
  clientTitleTemplate?: string | null;
  clientBodyTemplate?: string | null;
}

export type UpdateAlertRuleInput = Partial<CreateAlertRuleInput>;

const BASE = '/tenant/alerts';

export async function listPublishableEvents(): Promise<string[]> {
  const { data } = await api.get<ApiResponse<string[]>>(
    `${BASE}/publishable-events`,
  );
  return data.data;
}

export async function listAlertRules(): Promise<AlertRuleRow[]> {
  const { data } = await api.get<ApiResponse<AlertRuleRow[]>>(BASE);
  return data.data;
}

export async function createAlertRule(
  input: CreateAlertRuleInput,
): Promise<AlertRuleRow> {
  const { data } = await api.post<ApiResponse<AlertRuleRow>>(BASE, input);
  return data.data;
}

export async function updateAlertRule(
  id: string,
  input: UpdateAlertRuleInput,
): Promise<AlertRuleRow> {
  const { data } = await api.patch<ApiResponse<AlertRuleRow>>(
    `${BASE}/${id}`,
    input,
  );
  return data.data;
}

export async function deleteAlertRule(id: string): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}
