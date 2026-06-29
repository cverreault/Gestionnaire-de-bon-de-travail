/**
 * Quota types tracked per tenant (B6.6).
 *
 * Each maps 1:1 to a (max_X, current_X) pair on the Tenant row :
 *   USERS                 → max_users / current_users
 *   WORK_ORDERS_PER_MONTH → max_work_orders_per_month / current_work_orders_this_month
 *   STORAGE_BYTES         → max_storage_mb (MB → bytes) / current_storage_bytes
 *   CLIENTS               → max_clients / current_clients
 *
 * Adding a new quota = new enum value + new columns on Tenant + new
 * branch in QuotaService.{check,consume,release}.
 */
export enum QuotaType {
  USERS = 'USERS',
  WORK_ORDERS_PER_MONTH = 'WORK_ORDERS_PER_MONTH',
  STORAGE_BYTES = 'STORAGE_BYTES',
  CLIENTS = 'CLIENTS',
}

export class QuotaExceededException extends Error {
  constructor(public readonly quota: QuotaType, public readonly tenantId: string) {
    super(`Quota dépassé pour ${quota} (tenant=${tenantId})`);
    this.name = 'QuotaExceededException';
  }
}

/** DI token — bind in TenantsModule.providers. */
export const QUOTA_SERVICE = Symbol('QUOTA_SERVICE');

/** Read-only surface every consumer uses. Implementation in tenants module. */
export interface IQuotaService {
  checkAndConsume(quota: QuotaType, tenantId: string, amount?: number): Promise<void>;
  release(quota: QuotaType, tenantId: string, amount?: number): Promise<void>;
}
