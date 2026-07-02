import api from './api';
import type { ApiResponse } from '../types';

/**
 * Tenant admin CRUD for outbound webhooks (B9).
 *
 * Backed by `/api/tenant/webhooks`. ADMIN role — sidebar entry is hidden
 * for other roles and the backend enforces the guard regardless.
 */

export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  secretPrefix: string;
  subscribedEvents: string[];
  isActive: boolean;
  disabledReason: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MintedWebhook extends WebhookRow {
  /** ⚠️ Shown once — the UI must present it and then discard. */
  plaintext: string;
}

export interface DeliveryRow {
  id: string;
  eventId: string;
  eventName: string;
  status: 'pending' | 'succeeded' | 'failed' | 'abandoned' | 'dispatching';
  attemptCount: number;
  lastResponseStatus: number | null;
  lastResponseBodyExcerpt: string | null;
  lastError: string | null;
  firstAttemptedAt: string | null;
  lastAttemptedAt: string | null;
  succeededAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  subscribedEvents: string[];
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  subscribedEvents?: string[];
  isActive?: boolean;
}

const BASE = '/tenant/webhooks';

export async function listPublishableEvents(): Promise<string[]> {
  const { data } = await api.get<ApiResponse<string[]>>(
    `${BASE}/publishable-events`,
  );
  return data.data;
}

export async function listWebhooks(): Promise<WebhookRow[]> {
  const { data } = await api.get<ApiResponse<WebhookRow[]>>(BASE);
  return data.data;
}

export async function createWebhook(
  input: CreateWebhookInput,
): Promise<MintedWebhook> {
  const { data } = await api.post<ApiResponse<MintedWebhook>>(BASE, input);
  return data.data;
}

export async function updateWebhook(
  id: string,
  input: UpdateWebhookInput,
): Promise<WebhookRow> {
  const { data } = await api.patch<ApiResponse<WebhookRow>>(
    `${BASE}/${id}`,
    input,
  );
  return data.data;
}

export async function regenerateWebhookSecret(
  id: string,
): Promise<MintedWebhook> {
  const { data } = await api.post<ApiResponse<MintedWebhook>>(
    `${BASE}/${id}/regenerate-secret`,
  );
  return data.data;
}

export async function triggerWebhookTest(
  id: string,
): Promise<{ deliveryId: string }> {
  const { data } = await api.post<ApiResponse<{ deliveryId: string }>>(
    `${BASE}/${id}/test`,
  );
  return data.data;
}

export async function deleteWebhook(id: string): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}

export async function listDeliveries(
  id: string,
  limit = 50,
): Promise<DeliveryRow[]> {
  const { data } = await api.get<ApiResponse<DeliveryRow[]>>(
    `${BASE}/${id}/deliveries`,
    { params: { limit } },
  );
  return data.data;
}

export async function retryDelivery(deliveryId: string): Promise<void> {
  await api.post(`${BASE}/deliveries/${deliveryId}/retry`);
}
