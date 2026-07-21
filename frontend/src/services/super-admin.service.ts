import api from './api';
import type { ApiResponse } from '../types';

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
  logoStorageKey: string | null;
  /** Fresh presigned URL (1 h TTL) resolved server-side, or null. */
  logoUrl: string | null;
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
  const { data } = await api.get<ApiResponse<TenantsListResponse>>(
    '/super-admin/tenants',
    { params: { page, limit } },
  );
  return data.data;
}

export async function getTenant(id: string): Promise<TenantRow> {
  const { data } = await api.get<ApiResponse<TenantRow>>(
    `/super-admin/tenants/${id}`,
  );
  return data.data;
}

/**
 * Irreversible hard-delete. `confirmSlug` must equal the tenant slug — the UI
 * makes the SA type it. Purges all tenant data + MinIO objects server-side.
 */
export async function deleteTenant(
  id: string,
  confirmSlug: string,
): Promise<{ deleted: true; slug: string }> {
  const { data } = await api.delete<ApiResponse<{ deleted: true; slug: string }>>(
    `/super-admin/tenants/${id}`,
    { data: { confirmSlug } },
  );
  return data.data;
}

export async function updateTenant(
  id: string,
  patch: UpdateTenantInput,
): Promise<TenantRow> {
  const { data } = await api.patch<ApiResponse<TenantRow>>(
    `/super-admin/tenants/${id}`,
    patch,
  );
  return data.data;
}

// ─── Stats globales (B7) ────────────────────────────────────────────

export interface SuperAdminStats {
  tenants: { total: number; active: number; newThisMonth: number };
  users: { total: number; newThisMonth: number };
  workOrders: { createdThisMonth: number; completedThisMonth: number };
  storage: { totalBytes: number };
}

export async function getStats(): Promise<SuperAdminStats> {
  const { data } = await api.get<ApiResponse<SuperAdminStats>>(
    '/super-admin/stats',
  );
  return data.data;
}

// ─── Per-tenant usage (B7.7) ────────────────────────────────────────

export interface TenantUsageRow {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  isActive: boolean;
  users: { active: number; max: number; sessions: number };
  workOrders: { thisMonth: number; max: number; total: number };
  storage: { bytes: number; maxMb: number };
  clients: { count: number; max: number };
  createdAt: string;
  lastLoginAt: string | null;
  lastWorkOrderAt: string | null;
}

export async function getPerTenantUsage(): Promise<{ data: TenantUsageRow[] }> {
  const { data } = await api.get<ApiResponse<{ data: TenantUsageRow[] }>>(
    '/super-admin/stats/tenants',
  );
  return data.data;
}

// ─── Plan catalog (B7.7) ────────────────────────────────────────────

export interface PlanQuotas {
  maxUsers: number;
  maxWorkOrdersPerMonth: number;
  maxStorageMb: number;
  maxClients: number;
}

export interface PlanDefinition {
  /** Now named `code` server-side (matches DB column). Kept aliased to
   * `plan` for transitional UI bits — they fall back to `code` if unset. */
  code: TenantPlan;
  /** Legacy alias — older UI bits still read `plan` instead of `code`. */
  plan?: TenantPlan;
  displayName: string;
  tagline: string;
  description: string;
  priceMonthly: number;
  /** Per-active-user surcharge — billed monthly on top of `priceMonthly`. */
  pricePerUserMonthly: number;
  currency: 'CAD' | 'USD' | 'EUR';
  quotas: PlanQuotas;
  features: string[];
  /** B22 — Stripe recurring Price id; null = not purchasable online. */
  stripePriceId?: string | null;
  recommended?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

export async function getPlanCatalog(): Promise<PlanDefinition[]> {
  const { data } = await api.get<ApiResponse<PlanDefinition[]>>(
    '/super-admin/plans',
  );
  return data.data;
}

export interface UpdatePlanInput {
  displayName?: string;
  tagline?: string;
  description?: string;
  priceMonthly?: number;
  pricePerUserMonthly?: number;
  currency?: 'CAD' | 'USD' | 'EUR';
  maxUsers?: number;
  maxWorkOrdersPerMonth?: number;
  maxStorageMb?: number;
  maxClients?: number;
  features?: string[];
  /** B22 — Stripe Price id; empty string clears the binding. */
  stripePriceId?: string;
  recommended?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

export async function updatePlan(
  code: TenantPlan,
  patch: UpdatePlanInput,
): Promise<PlanDefinition> {
  const { data } = await api.patch<ApiResponse<PlanDefinition>>(
    `/super-admin/plans/${code}`,
    patch,
  );
  return data.data;
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
  const { data } = await api.get<ApiResponse<AuditSearchResponse>>(
    '/super-admin/audit',
    { params: q },
  );
  return data.data;
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
): Promise<UserSearchRow[]> {
  const { data } = await api.get<ApiResponse<UserSearchRow[]>>(
    '/super-admin/users',
    { params: { email } },
  );
  return data.data;
}

// ─── All-users management (B7 follow-up) ────────────────────────────

export interface AllUsersRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN';
  isActive: boolean;
  createdAt: string;
  tenant: { id: string; slug: string; name: string };
}

export interface AllUsersListResponse {
  data: AllUsersRow[];
  pagination: { page: number; limit: number; total: number };
}

export interface AllUsersQuery {
  page?: number;
  limit?: number;
  email?: string;
  tenantId?: string;
}

export async function listAllUsers(q: AllUsersQuery): Promise<AllUsersListResponse> {
  const { data } = await api.get<ApiResponse<AllUsersListResponse>>(
    '/super-admin/all-users',
    { params: q },
  );
  return data.data;
}

export interface UpdateUserBySuperAdminInput {
  tenantId?: string;
  role?: 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN';
  isActive?: boolean;
}

export async function updateUserBySuperAdmin(
  id: string,
  patch: UpdateUserBySuperAdminInput,
): Promise<AllUsersRow> {
  const { data } = await api.patch<ApiResponse<AllUsersRow>>(
    `/super-admin/all-users/${id}`,
    patch,
  );
  return data.data;
}

// ─── Impersonate (B6.11 + B7) ───────────────────────────────────────

export interface ImpersonateResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN';
    tenantId: string;
  };
  tenant: { id: string; slug: string; name: string };
}

export async function impersonate(
  payload: { userId: string } | { tenantId: string },
): Promise<ImpersonateResponse> {
  const { data } = await api.post<ApiResponse<ImpersonateResponse>>(
    '/super-admin/impersonate',
    payload,
  );
  return data.data;
}

// ─── Create tenant (B7.5) ───────────────────────────────────────────

export type AssignableRole = 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN';

export interface CreateTenantInput {
  slug: string;
  name: string;
  plan?: TenantPlan;
  maxUsers?: number;
  maxWorkOrdersPerMonth?: number;
  maxStorageMb?: number;
  maxClients?: number;
  admin: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
}

export interface CreateTenantResponse {
  tenant: { id: string; slug: string; name: string; plan: TenantPlan };
  admin: { id: string; email: string };
}

export async function createTenant(
  input: CreateTenantInput,
): Promise<CreateTenantResponse> {
  const { data } = await api.post<ApiResponse<CreateTenantResponse>>(
    '/super-admin/tenants',
    input,
  );
  return data.data;
}

export interface TenantLogoResponse {
  logoStorageKey: string;
  logoUrl: string;
}

export async function uploadTenantLogo(
  tenantId: string,
  file: File,
): Promise<TenantLogoResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<ApiResponse<TenantLogoResponse>>(
    `/super-admin/tenants/${tenantId}/logo`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

// ─── Create user in a tenant (B7.5) ─────────────────────────────────

export interface CreateUserInput {
  tenantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: AssignableRole;
  phone?: string;
  isActive?: boolean;
}

export async function createUserBySuperAdmin(
  input: CreateUserInput,
): Promise<AllUsersRow> {
  const { data } = await api.post<ApiResponse<AllUsersRow>>(
    '/super-admin/all-users',
    input,
  );
  return data.data;
}

// ─── Platform SUPER_ADMINs (B7.6) ───────────────────────────────────

export interface PlatformSuperAdminRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreatePlatformSuperAdminInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export async function listPlatformSuperAdmins(): Promise<{
  data: PlatformSuperAdminRow[];
}> {
  const { data } = await api.get<ApiResponse<{ data: PlatformSuperAdminRow[] }>>(
    '/super-admin/platform-users',
  );
  return data.data;
}

export async function createPlatformSuperAdmin(
  input: CreatePlatformSuperAdminInput,
): Promise<PlatformSuperAdminRow> {
  const { data } = await api.post<ApiResponse<PlatformSuperAdminRow>>(
    '/super-admin/platform-users',
    input,
  );
  return data.data;
}

// ─── Public tenant branding (B7.5) ──────────────────────────────────

export interface TenantBranding {
  /** null on the apex / auth / reserved subdomains (no tenant in play). */
  slug: string | null;
  name: string;
  logoUrl: string | null;
}

/**
 * Public — resolves the tenant from the request Host (subdomain) and returns
 * the name + logo to brand the login screen. Safe to call unauthenticated.
 */
export async function getBranding(): Promise<TenantBranding> {
  const { data } = await api.get<ApiResponse<TenantBranding>>(
    '/tenants/branding',
  );
  return data.data;
}
