import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role, TenantPlan } from '@prisma/client';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PrimaryAdminGuard } from '../../../common/guards/primary-admin.guard';
import { PlansService } from '../application/plans.service';
import { PeakTrackerService } from '../application/peak-tracker.service';

/** Domain event — picked up by the audit wildcard listener + SA dashboard. */
export const PLAN_CHANGE_REQUESTED = 'platform.plan_change_requested';

export type QuotaKind = 'users' | 'workOrders' | 'clients' | 'storage';
export type QuotaSeverity = 'warning' | 'danger' | 'exceeded';
export interface QuotaWarning {
  kind: QuotaKind;
  severity: QuotaSeverity;
  percent: number;
  current: number;
  max: number;
}

/**
 * Threshold rules — kept as a small pure function so the SA per-tenant
 * usage endpoint can reuse the exact same severity mapping without
 * duplicating literals.
 */
export function quotaWarning(
  kind: QuotaKind,
  current: number,
  max: number,
): QuotaWarning | null {
  if (max <= 0) return null;
  const percent = Math.round((current / max) * 100);
  if (percent >= 100) return { kind, severity: 'exceeded', percent, current, max };
  if (percent >= 90) return { kind, severity: 'danger', percent, current, max };
  if (percent >= 75) return { kind, severity: 'warning', percent, current, max };
  return null;
}

class RequestPlanChangeDto {
  @IsEnum(TenantPlan, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  targetPlan!: TenantPlan;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(500, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  message?: string;
}

/**
 * Tenant self-service subscription page (B7.9).
 *
 * `GET  /api/tenant/subscription` — the primary admin sees their current
 *   plan, quotas, usage counters, and monthly charge estimate.
 * `POST /api/tenant/subscription/change-request` — records an intent to
 *   change plan. Emits a domain event so the SA sees it via audit /
 *   notifications instead of the change happening silently. The actual
 *   plan switch stays SA-driven for now (SA approves + PATCHes the plan
 *   through `/super-admin/tenants/:id`).
 *
 * Both routes are gated by `PrimaryAdminGuard` — the FIRST active ADMIN
 * by `created_at ASC` inside the tenant. This matches the account-owner
 * semantics the SA impersonation flow already uses (SA enters as the
 * first admin).
 */
@ApiTags('Tenant subscription')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@UseGuards(PrimaryAdminGuard)
@Controller('tenant/subscription')
export class TenantSubscriptionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly peakTracker: PeakTrackerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Voir le plan, les quotas, l\'usage et la facturation estimée',
  })
  async mySubscription(
    @CurrentUser() actor: { tenantId: string; id: string },
  ) {
    // Tenant row via Prisma — Tenant model isn't in TENANT_SCOPED_MODELS,
    // so the middleware doesn't interfere. Raw SQL for the counters and
    // to sidestep the middleware entirely on user / client / WO counts.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        isActive: true,
        maxUsers: true,
        maxWorkOrdersPerMonth: true,
        maxStorageMb: true,
        maxClients: true,
        currentStorageBytes: true,
        createdAt: true,
      },
    });
    if (!tenant) {
      throw new Error('Tenant introuvable');
    }

    type Row = {
      active_users: bigint;
      clients_count: bigint;
      work_orders_this_month: bigint;
    };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         (SELECT count(*)::bigint FROM users
            WHERE tenant_id = $1 AND is_active = true) AS active_users,
         (SELECT count(*)::bigint FROM clients
            WHERE tenant_id = $1) AS clients_count,
         (SELECT count(*)::bigint FROM work_orders
            WHERE tenant_id = $1
              AND created_at >= date_trunc('month', CURRENT_TIMESTAMP))
            AS work_orders_this_month`,
      actor.tenantId,
    );
    const counters = rows[0] ?? {
      active_users: 0n,
      clients_count: 0n,
      work_orders_this_month: 0n,
    };

    const plan = await this.plans.getByCode(tenant.plan);
    const activeUsers = Number(counters.active_users);

    // Per-seat billing is computed on the MONTH'S PEAK, not the current
    // active count — a tenant that ramped from 2 → 4 → 2 users pays for
    // 4 seats. The peak is at least the current count (it's updated on
    // every increment) and never regresses within the month.
    const peaks = await this.peakTracker.currentMonthPeaks(actor.tenantId);
    const billedUsers = Math.max(peaks.maxUsers, activeUsers);
    const monthlyCharge =
      plan.priceMonthly + billedUsers * plan.pricePerUserMonthly;

    const storageMb = Number(tenant.currentStorageBytes) / 1024 / 1024;
    const currentClients = Number(counters.clients_count);
    const workOrdersThisMonth = Number(counters.work_orders_this_month);

    // Threshold detection for quota warnings (B7.10). Anything ≥ 90% is a
    // "danger" — the admin should see a red banner and a nudge to upgrade.
    // 75% → warning (yellow). Below → clear.
    const warnings = [
      quotaWarning('users', activeUsers, tenant.maxUsers),
      quotaWarning('workOrders', workOrdersThisMonth, tenant.maxWorkOrdersPerMonth),
      quotaWarning('clients', currentClients, tenant.maxClients),
      quotaWarning('storage', storageMb, tenant.maxStorageMb),
    ].filter((w): w is QuotaWarning => w !== null);

    return {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
      },
      plan,
      quotas: {
        maxUsers: tenant.maxUsers,
        maxWorkOrdersPerMonth: tenant.maxWorkOrdersPerMonth,
        maxStorageMb: tenant.maxStorageMb,
        maxClients: tenant.maxClients,
      },
      usage: {
        activeUsers,
        currentClients,
        currentWorkOrdersThisMonth: workOrdersThisMonth,
        currentStorageBytes: Number(tenant.currentStorageBytes),
      },
      billing: {
        priceMonthly: plan.priceMonthly,
        pricePerUserMonthly: plan.pricePerUserMonthly,
        currency: plan.currency,
        monthlyCharge,
        /** Seat count actually billed this month (peak, not current). */
        billedUsers,
      },
      peaks: {
        yearMonth: peaks.yearMonth,
        maxUsers: Math.max(peaks.maxUsers, activeUsers),
        maxClients: Math.max(peaks.maxClients, Number(counters.clients_count)),
        maxWorkOrdersThisMonth: Math.max(
          peaks.maxWorkOrdersThisMonth,
          Number(counters.work_orders_this_month),
        ),
        maxStorageBytes: Math.max(
          peaks.maxStorageBytes,
          Number(tenant.currentStorageBytes),
        ),
      },
      warnings,
    };
  }

  @Get('history')
  @ApiOperation({
    summary: 'Historique mensuel des pics (utilisateurs, clients, BTs, stockage)',
  })
  async history(
    @CurrentUser() actor: { tenantId: string },
  ) {
    // 12 months is a full year of context — enough to spot seasonality
    // and forecast next month's bill, and small enough to render as one
    // table without pagination.
    return { data: await this.peakTracker.history(actor.tenantId, 12) };
  }

  @Post('change-request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Demander un changement de plan (l\'équipe plateforme valide)',
  })
  async requestChange(
    @CurrentUser() actor: { id: string; tenantId: string; email: string },
    @Body() dto: RequestPlanChangeDto,
  ) {
    // Sanity — target plan must exist and be active.
    const target = await this.plans.getByCode(dto.targetPlan);
    if (!target.isActive) {
      throw new Error(`Le plan ${dto.targetPlan} n'est pas disponible`);
    }

    // Grab the current plan for the audit trail so the SA sees "PRO → ENTERPRISE".
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { id: true, slug: true, name: true, plan: true },
    });
    if (!tenant) {
      throw new Error('Tenant introuvable');
    }

    this.eventEmitter.emit(PLAN_CHANGE_REQUESTED, {
      eventName: PLAN_CHANGE_REQUESTED,
      occurredAt: new Date(),
      aggregateId: tenant.id,
      actorUserId: actor.id,
      tenantId: tenant.id,
      data: {
        currentPlan: tenant.plan,
        targetPlan: dto.targetPlan,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        requestedByEmail: actor.email,
        message: dto.message ?? null,
      },
    });

    return {
      status: 'received',
      currentPlan: tenant.plan,
      targetPlan: dto.targetPlan,
      message:
        'Votre demande a été transmise à l\'équipe plateforme. Vous serez notifié lorsqu\'elle sera traitée.',
    };
  }
}
