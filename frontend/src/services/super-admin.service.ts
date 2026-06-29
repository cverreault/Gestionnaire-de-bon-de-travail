import api from './api';

// ─── Tenants list / detail / update (B6.10) ─────────────────────────

export type TenantPlan = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  plan: TenantPlan;
  maxUsers: number;
  maxWorkOrdersPerMonth: number;
  maxStorageMb: number;
  maxClients: number;
  currentUsers: number;
  currentWorkOrdersThisMonth: number;
  currentStorageBytes: number;
  currentClients: number;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantsListResponse {
  data: TenantRow[];
  pagination: { page: number; limit: number; total: number };
}

export interface UpdateTenantInput {
  name?: string;
  plan?: TenantPlan;
  isActive?: boolean;
  maxUsers?: number;
  maxWorkOrdersPerMonth?: number;
  maxStorageMb?: number;
  maxClients?: number;
}

export async function listTenants(
  page = 1,
  limit = 20,
): Promise<TenantsListResponse> {
  const { data } = await api.get<TenantsListResponse>('/super-admin/tenants', {
    params: { page, limit },
  });
  return data;
}

export async function getTenant(id: string): Promise<TenantRow> {
  const { data } = await api.get<TenantRow>(`/super-admin/tenants/${id}`);
  return data;
}

export async function updateTenant(
  id: string,
  patch: UpdateTenantInput,
): Promise<TenantRow> {
  const { data } = await api.patch<TenantRow>(
    `/super-admin/tenants/${id}`,
    patch,
  );
  return data;
}

// ─── Stats globales (B7) ────────────────────────────────────────────

export interface SuperAdminStats {
  tenants: { total: number; active: number; newThisMonth: number };
  users: { total: number; newThisMonth: number };
  workOrders: { createdThisMonth: number; completedThisMonth: number };
  storage: { totalBytes: number };
}

export async function getStats(): Promise<SuperAdminStats> {
  const { data } = await api.get<SuperAdminStats>('/super-admin/stats');
  return data;
}

// ─── Audit cross-tenant (B7) ────────────────────────────────────────

export interface AuditRow {
  id: string;
  eventName: string;
  aggregateId: string | null;
  occurredAt: string;
  actorUserId: string | null;
  data: unknown;
  tenantId: string;
  tenantSlug: string | null;
}

export interface AuditQuery {
  from?: string;
  to?: string;
  tenantSlug?: string;
  actor?: string;
  eventName?: string;
  page?: number;
  limit?: number;
}

export interface AuditSearchResponse {
  data: AuditRow[];
  pagination: { page: number; limit: number; total: number };
}

export async function searchAudit(q: AuditQuery): Promise<AuditSearchResponse> {
  const { data } = await api.get<AuditSearchResponse>('/super-admin/audit', {
    params: q,
  });
  return data;
}

// ─── User search cross-tenant (B7) ──────────────────────────────────

export interface UserSearchRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN';
  isActive: boolean;
  tenant: { id: string; slug: string; name: string };
}

export async function searchUsers(
  email: string,
): Promise<{ data: UserSearchRow[] }> {
  const { data } = await api.get<{ data: UserSearchRow[] }>(
    '/super-admin/users',
    { params: { email } },
  );
  return data;
}

// ─── Impersonate (B6.11 + B7) ───────────────────────────────────────

export interface ImpersonateResponse {
  accessToken: string;
  user: { id: string; email: string; tenantId: string };
  tenant: { id: string; slug: string; name: string };
}

export async function impersonate(
  payload: { userId: string } | { tenantId: string },
): Promise<ImpersonateResponse> {
  const { data } = await api.post<ImpersonateResponse>(
    '/super-admin/impersonate',
    payload,
  );
  return data;
}
