import type {
  AttachmentRef,
  SyncPullResponse,
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

/** B47 — driving route (Valhalla) : distance, ETA and maneuvers. */
export interface RouteEstimate {
  distanceKm: number;
  durationMin: number;
  legs: Array<{ maneuvers: Array<{ instruction: string; distanceKm: number; durationMin: number }> }>;
}
export function fetchRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }, language: 'fr' | 'en'): Promise<RouteEstimate> {
  return api<RouteEstimate>('/geo/route', { method: 'POST', body: { from, to, language }, timeoutMs: 12_000 });
}

/** B49 — mileage of a work order from the phone position (one way or round trip). */
export function computeTravelFromHere(workOrderId: string, pos: { lat: number; lng: number }, roundTrip: boolean): Promise<{ distanceKm: number; durationMin: number; roundTrip: boolean; originLabel: string }> {
  return api(`/work-orders/${workOrderId}/travel/compute`, { method: 'POST', body: { origin: { type: 'COORDS', lat: pos.lat, lng: pos.lng, label: 'Position du téléphone' }, roundTrip }, timeoutMs: 15_000 });
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

export function saveSignatures(
  workOrderId: string,
  dto: { signatureClient?: string | null; signatureTechnician?: string | null; expectedUpdatedAt?: string },
  idempotencyKey?: string,
): Promise<WorkOrderSummary> {
  return api<WorkOrderSummary>(`/work-orders/${workOrderId}/signatures`, { method: 'POST', body: dto, idempotencyKey });
}

export function updateWorkOrder(
  workOrderId: string,
  dto: { templateData?: Record<string, unknown>; completionNotes?: string; negativeReason?: string; expectedUpdatedAt?: string },
  idempotencyKey?: string,
): Promise<WorkOrderSummary> {
  return api<WorkOrderSummary>(`/work-orders/${workOrderId}`, { method: 'PATCH', body: dto, idempotencyKey });
}

export function addWorkOrderPart(
  workOrderId: string,
  dto: { partId: string; quantity: number; source: 'WAREHOUSE' | 'TECHNICIAN_STOCK' },
  idempotencyKey?: string,
): Promise<{ id: string; workOrderUpdatedAt?: string }> {
  return api(`/work-orders/${workOrderId}/parts`, { method: 'POST', body: dto, idempotencyKey });
}

export function removeWorkOrderPart(workOrderId: string, rowId: string, idempotencyKey?: string): Promise<{ removed: boolean; workOrderUpdatedAt?: string }> {
  return api(`/work-orders/${workOrderId}/parts/${rowId}`, { method: 'DELETE', idempotencyKey });
}

// ── GPS (B37.7 / B38.8) ──────────────────────────────────────────────────────

export interface LocationFixDto {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  recordedAt: string;
  source: 'MOBILE_FOREGROUND' | 'MOBILE_BACKGROUND';
}

/** B57 — « ouvert / fermé » in the work-order history ; best effort (offline = lost). */
export function reportWorkOrderView(id: string, action: 'opened' | 'closed', at = new Date()): Promise<void> {
  return api<void>(`/work-orders/${id}/view`, { method: 'POST', body: { action, at: at.toISOString(), source: 'mobile' }, timeoutMs: 8_000 }).catch(() => undefined);
}

export function postLocationBatch(fixes: LocationFixDto[], idempotencyKey: string): Promise<{ accepted: number; duplicates: number; rejected: unknown[] }> {
  return api('/me/locations/batch', {
    method: 'POST',
    body: { fixes: fixes.map((f) => ({ ...f, accuracy: f.accuracy ?? undefined })) },
    idempotencyKey,
    allowRefresh: true,
  });
}

export function updateMyPreferences(patch: Record<string, unknown>): Promise<unknown> {
  return api('/users/me/preferences', { method: 'PATCH', body: patch });
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

export function sendDeviceReport(installationId: string, body: { state: Record<string, unknown>; events: Record<string, unknown>[]; note?: string }): Promise<{ receivedAt: string }> {
  return api<{ receivedAt: string }>(`/me/devices/${installationId}/report`, { method: 'POST', body, timeoutMs: 30_000 });
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

// ── Sync (B37.6 / B38.4) ─────────────────────────────────────────────────────

export function pullSync(cursor: string | null, limit: number, opts: { allowRefresh?: boolean } = {}): Promise<SyncPullResponse> {
  return api<SyncPullResponse>('/me/sync', { query: { cursor: cursor ?? undefined, limit }, timeoutMs: 30_000, allowRefresh: opts.allowRefresh ?? true });
}
