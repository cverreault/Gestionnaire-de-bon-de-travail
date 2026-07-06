import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPlan } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Plan catalog service (B7.8).
 *
 * Wraps the `plans` table. Single source of truth for plan metadata at
 * runtime — the in-code constants are kept only as a seed reference for
 * the initial migration.
 *
 * Tenant-scope middleware is irrelevant here : the `Plan` model is global,
 * not tenant-scoped (not in TENANT_SCOPED_MODELS). Plain Prisma calls.
 */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PlanDto[]> {
    const rows = await this.prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map(toDto);
  }

  async getByCode(code: TenantPlan): Promise<PlanDto> {
    const row = await this.prisma.plan.findUnique({ where: { code } });
    if (!row) {
      throw new NotFoundException(`Plan ${code} introuvable`);
    }
    return toDto(row);
  }

  /**
   * Update a subset of plan fields. The plan `code` itself is never
   * editable — it's the join key with `tenants.plan` and must stay
   * stable. Passing an unknown code → 404.
   */
  async update(code: TenantPlan, patch: PlanUpdateInput): Promise<PlanDto> {
    const existing = await this.prisma.plan.findUnique({ where: { code } });
    if (!existing) {
      throw new NotFoundException(`Plan ${code} introuvable`);
    }
    const updated = await this.prisma.plan.update({
      where: { code },
      data: {
        ...(patch.displayName !== undefined && { displayName: patch.displayName }),
        ...(patch.tagline !== undefined && { tagline: patch.tagline }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.priceMonthly !== undefined && { priceMonthly: patch.priceMonthly }),
        ...(patch.pricePerUserMonthly !== undefined && {
          pricePerUserMonthly: patch.pricePerUserMonthly,
        }),
        ...(patch.currency !== undefined && { currency: patch.currency }),
        ...(patch.maxUsers !== undefined && { maxUsers: patch.maxUsers }),
        ...(patch.maxWorkOrdersPerMonth !== undefined && {
          maxWorkOrdersPerMonth: patch.maxWorkOrdersPerMonth,
        }),
        ...(patch.maxStorageMb !== undefined && { maxStorageMb: patch.maxStorageMb }),
        ...(patch.maxClients !== undefined && { maxClients: patch.maxClients }),
        ...(patch.features !== undefined && { features: patch.features }),
        ...(patch.stripePriceId !== undefined && {
          stripePriceId: patch.stripePriceId.trim() || null,
        }),
        ...(patch.recommended !== undefined && { recommended: patch.recommended }),
        ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
        ...(patch.isActive !== undefined && { isActive: patch.isActive }),
      },
    });
    return toDto(updated);
  }
}

export interface PlanDto {
  code: TenantPlan;
  displayName: string;
  tagline: string;
  description: string;
  /** Numeric form — Prisma Decimal → number once for the API surface. */
  priceMonthly: number;
  pricePerUserMonthly: number;
  currency: string;
  quotas: {
    maxUsers: number;
    maxWorkOrdersPerMonth: number;
    maxStorageMb: number;
    maxClients: number;
  };
  features: string[];
  recommended: boolean;
  sortOrder: number;
  isActive: boolean;
  /** B22 — Stripe Price id; null = not purchasable online. */
  stripePriceId: string | null;
}

export interface PlanUpdateInput {
  displayName?: string;
  tagline?: string;
  description?: string;
  priceMonthly?: number;
  pricePerUserMonthly?: number;
  currency?: string;
  maxUsers?: number;
  maxWorkOrdersPerMonth?: number;
  maxStorageMb?: number;
  maxClients?: number;
  features?: string[];
  recommended?: boolean;
  sortOrder?: number;
  isActive?: boolean;
  /** B22 — Stripe Price id; empty string clears the binding. */
  stripePriceId?: string;
}

function toDto(row: {
  code: TenantPlan;
  displayName: string;
  tagline: string;
  description: string;
  priceMonthly: unknown;
  pricePerUserMonthly: unknown;
  currency: string;
  maxUsers: number;
  maxWorkOrdersPerMonth: number;
  maxStorageMb: number;
  maxClients: number;
  features: string[];
  recommended: boolean;
  sortOrder: number;
  isActive: boolean;
  stripePriceId: string | null;
}): PlanDto {
  return {
    code: row.code,
    displayName: row.displayName,
    tagline: row.tagline,
    description: row.description,
    priceMonthly: Number(row.priceMonthly),
    pricePerUserMonthly: Number(row.pricePerUserMonthly),
    currency: row.currency,
    quotas: {
      maxUsers: row.maxUsers,
      maxWorkOrdersPerMonth: row.maxWorkOrdersPerMonth,
      maxStorageMb: row.maxStorageMb,
      maxClients: row.maxClients,
    },
    features: row.features,
    stripePriceId: row.stripePriceId,
    recommended: row.recommended,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}
