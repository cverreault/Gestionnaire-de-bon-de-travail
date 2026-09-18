import type {
  AuthUser,
  AvailableTransitionsResponse,
  LoginResponse,
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

export function transitionWorkOrder(id: string, dto: TransitionDto): Promise<WorkOrderSummary> {
  return api<WorkOrderSummary>(`/work-orders/${id}/transition`, { method: 'POST', body: dto });
}
