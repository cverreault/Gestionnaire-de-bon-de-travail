import api from './api';
import type { ApiResponse } from '../types';
import type { PlanDefinition } from './super-admin.service';

/**
 * Tenant self-service subscription (B7.9).
 *
 * Backed by `/api/tenant/subscription` — gated by PrimaryAdminGuard on
 * the backend, so a 403 here means the caller isn't the tenant's primary
 * admin (the frontend hides the sidebar entry for regular ADMINs to keep
 * things obvious, but the guard is the source of truth).
 */

export type PlanCode = 'FREE' | 'PRO' | 'ENTERPRISE';

export type QuotaKind = 'users' | 'workOrders' | 'clients' | 'storage';
export type QuotaSeverity = 'warning' | 'danger' | 'exceeded';
export interface QuotaWarning {
  kind: QuotaKind;
  severity: QuotaSeverity;
  percent: number;
  current: number;
  max: number;
}

export interface MySubscription {
  tenant: {
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
    createdAt: string;
  };
  plan: PlanDefinition;
  quotas: {
    maxUsers: number;
    maxWorkOrdersPerMonth: number;
    maxStorageMb: number;
    maxClients: number;
  };
  usage: {
    activeUsers: number;
    currentClients: number;
    currentWorkOrdersThisMonth: number;
    currentStorageBytes: number;
  };
  billing: {
    priceMonthly: number;
    pricePerUserMonthly: number;
    currency: string;
    monthlyCharge: number;
    /** Seat count actually billed this month (month's peak, not current). */
    billedUsers: number;
  };
  peaks: {
    yearMonth: string;
    maxUsers: number;
    maxClients: number;
    maxWorkOrdersThisMonth: number;
    maxStorageBytes: number;
  };
  warnings: QuotaWarning[];
}

export interface MonthlyPeakRow {
  yearMonth: string;
  maxUsers: number;
  maxClients: number;
  maxWorkOrdersThisMonth: number;
  maxStorageBytes: number;
}

export async function getSubscriptionHistory(): Promise<{ data: MonthlyPeakRow[] }> {
  const { data } = await api.get<ApiResponse<{ data: MonthlyPeakRow[] }>>(
    '/tenant/subscription/history',
  );
  return data.data;
}

export async function getMySubscription(): Promise<MySubscription> {
  const { data } = await api.get<ApiResponse<MySubscription>>(
    '/tenant/subscription',
  );
  return data.data;
}

export interface RequestPlanChangeInput {
  targetPlan: PlanCode;
  message?: string;
}

export interface RequestPlanChangeResponse {
  status: 'received';
  currentPlan: PlanCode;
  targetPlan: PlanCode;
  message: string;
}

export async function requestPlanChange(
  input: RequestPlanChangeInput,
): Promise<RequestPlanChangeResponse> {
  const { data } = await api.post<ApiResponse<RequestPlanChangeResponse>>(
    '/tenant/subscription/change-request',
    input,
  );
  return data.data;
}
