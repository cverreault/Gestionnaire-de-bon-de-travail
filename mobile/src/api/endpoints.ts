import type {
  AttachmentRef,
  AuthUser,
  AvailableTransitionsResponse,
  LoginResponse,
  NoteRef,
  PaginatedResponse,
  TenantBranding,
  TransitionDto,
  WorkOrderSummary,
} from '@taskmgr/shared';
import { api } from './client';
import { useSession } from '../stores/session.store';

/** Public: validates a workspace URL and returns its branding (no token). */
export async function fetchBranding(baseUrl: string): Promise<TenantBranding> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tenants/branding`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: TenantBranding } & TenantBranding;
  return json.data ?? json;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password }, anonymous: true });
}

export function login2fa(pendingToken: string, code: string) {
  return api<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/login/2fa', {
    method: 'POST', body: { pendingToken, code }, anonymous: true,
  });
}

export async function logout(): Promise<void> {
  const { refreshToken } = useSession.getState();
  if (!refreshToken) return;
  try {
    await api('/auth/logout', { method: 'POST', body: { refreshToken }, allowRefresh: false });
  } catch {
    // Best effort: the local session is cleared regardless.
  }
}

export function fetchMe(): Promise<AuthUser> {
  return api<AuthUser>('/auth/me');
}

/** Technician list: the server already restricts to the caller's assignments. */
export function fetchMyWorkOrders(): Promise<PaginatedResponse<WorkOrderSummary>> {
  return api<PaginatedResponse<WorkOrderSummary>>('/work-orders', {
    query: { excludeCompleted: true, limit: 100 },
  });
}

export function fetchWorkOrder(id: string): Promise<WorkOrderSummary> {
  return api<WorkOrderSummary>(`/work-orders/${id}`);
}

export function fetchAvailableTransitions(id: string): Promise<AvailableTransitionsResponse> {
  return api<AvailableTransitionsResponse>(`/work-orders/${id}/available-transitions`);
}

export function transitionWorkOrder(id: string, dto: TransitionDto, idempotencyKey?: string): Promise<WorkOrderSummary> {
  return api<WorkOrderSummary>(`/work-orders/${id}/transition`, { method: 'POST', body: dto, idempotencyKey });
}

export function addNote(workOrderId: string, content: string, idempotencyKey?: string): Promise<NoteRef> {
  return api<NoteRef>(`/work-orders/${workOrderId}/notes`, { method: 'POST', body: { content }, idempotencyKey });
}

export function fetchAttachments(workOrderId: string): Promise<AttachmentRef[]> {
  return api<AttachmentRef[]>(`/work-orders/${workOrderId}/attachments`);
}

export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

/** Multipart upload (field `file`), same endpoint as the web app. */
export function uploadAttachment(workOrderId: string, file: LocalFile, idempotencyKey?: string): Promise<AttachmentRef> {
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } for files.
  form.append('file', file as unknown as Blob);
  return api<AttachmentRef>(`/work-orders/${workOrderId}/attachments`, { method: 'POST', body: form, timeoutMs: 60_000, idempotencyKey });
}

/** Image source for the streaming proxy (B37.9): bearer token in headers. */
export function attachmentContentSource(attachmentId: string): { uri: string; headers: Record<string, string> } {
  const { workspace, accessToken } = useSession.getState();
  const base = (workspace?.baseUrl ?? '').replace(/\/+$/, '');
  return {
    uri: `${base}/api/attachments/${attachmentId}/content`,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  };
}

// ── Devices (B37.3 / B37.8) ──────────────────────────────────────────────────

export interface DeviceView {
  installationId: string;
  platform: 'IOS' | 'ANDROID';
  appVersion: string;
  osVersion: string | null;
  model: string | null;
  locale: string | null;
  hasPushToken: boolean;
  lastSeenAt: string;
  createdAt: string;
}

export interface RegisterDevicePayload {
  platform: 'IOS' | 'ANDROID';
  appVersion: string;
  osVersion?: string;
  model?: string;
  locale?: string;
  pushToken?: string;
}

export interface HeartbeatResponse {
  upgradeRequired: boolean;
  minAppVersion: string;
  latestAppVersion: string | null;
  serverTime: string;
}

export interface MobileConfig {
  minAppVersion: { ios: string; android: string };
  latestAppVersion: string | null;
  tenant: { slug: string; name: string } | null;
  features: Record<string, boolean>;
  limits: { attachmentMaxBytes: number; locationBatchMax: number; syncPageMax: number };
  serverTime: string;
  backendVersion: string;
}

export function registerDevice(installationId: string, payload: RegisterDevicePayload): Promise<DeviceView> {
  return api<DeviceView>(`/me/devices/${installationId}`, { method: 'PUT', body: payload });
}

export function heartbeat(installationId: string, payload: { appVersion?: string; osVersion?: string; pushToken?: string }): Promise<HeartbeatResponse> {
  return api<HeartbeatResponse>(`/me/devices/${installationId}/heartbeat`, { method: 'POST', body: payload });
}

export function fetchMyDevices(): Promise<DeviceView[]> {
  return api<DeviceView[]>('/me/devices');
}

export function revokeDevice(installationId: string): Promise<void> {
  return api<void>(`/me/devices/${installationId}`, { method: 'DELETE' });
}

/** Public bootstrap config; validated on the workspace screen (no token). */
export async function fetchMobileConfig(baseUrl: string): Promise<MobileConfig> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/mobile/config`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: MobileConfig } & MobileConfig;
  return json.data ?? json;
}
