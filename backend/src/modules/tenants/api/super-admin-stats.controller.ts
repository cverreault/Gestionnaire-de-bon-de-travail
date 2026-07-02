import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Roles } from '../../../common/decorators/roles.decorator';

interface CountRow {
  c: bigint;
}

/**
 * SuperAdmin cross-tenant stats (B7).
 *
 * GET /super-admin/stats returns a snapshot of the platform health :
 * tenants / users / work orders / storage. All counters are computed
 * via raw SQL so the tenant-scope middleware doesn't filter them —
 * SA explicitly looks across every tenant.
 *
 * The shape mirrors what the SA portal stats page renders : 4 KPI
 * cards. No drill-down on this endpoint ; trend / time-series would
 * be a separate /super-admin/stats/trend route.
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/stats')
export class SuperAdminStatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Stats globales cross-tenant pour le portail SA' })
  async snapshot() {
    // Single round-trip per counter — Prisma's $queryRawUnsafe doesn't
    // do parameter binding inside a single statement combining multiple
    // counts cleanly, so we fan out with Promise.all.
    const [
      tenantsTotal,
      tenantsActive,
      tenantsNewThisMonth,
      usersTotal,
      usersNewThisMonth,
      workOrdersCreatedThisMonth,
      workOrdersCompletedThisMonth,
      storageBytes,
    ] = await Promise.all([
      this.prisma.$queryRawUnsafe<CountRow[]>(
        `SELECT count(*)::bigint AS c FROM tenants`,
      ),
      this.prisma.$queryRawUnsafe<CountRow[]>(
        `SELECT count(*)::bigint AS c FROM tenants WHERE is_active = true`,
      ),
      this.prisma.$queryRawUnsafe<CountRow[]>(
        `SELECT count(*)::bigint AS c FROM tenants
         WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
      ),
      this.prisma.$queryRawUnsafe<CountRow[]>(
        `SELECT count(*)::bigint AS c FROM users WHERE is_active = true`,
      ),
      this.prisma.$queryRawUnsafe<CountRow[]>(
        `SELECT count(*)::bigint AS c FROM users
         WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
      ),
      this.prisma.$queryRawUnsafe<CountRow[]>(
        `SELECT count(*)::bigint AS c FROM work_orders
         WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
      ),
      this.prisma.$queryRawUnsafe<CountRow[]>(
        `SELECT count(*)::bigint AS c FROM work_orders
         WHERE status IN ('COMPLETED_POSITIVE', 'COMPLETED_NEGATIVE')
         AND updated_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
      ),
      this.prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COALESCE(sum(current_storage_bytes), 0)::bigint AS c FROM tenants`,
      ),
    ]);

    return {
      tenants: {
        total: Number(tenantsTotal[0]?.c ?? 0n),
        active: Number(tenantsActive[0]?.c ?? 0n),
        newThisMonth: Number(tenantsNewThisMonth[0]?.c ?? 0n),
      },
      users: {
        total: Number(usersTotal[0]?.c ?? 0n),
        newThisMonth: Number(usersNewThisMonth[0]?.c ?? 0n),
      },
      workOrders: {
        createdThisMonth: Number(workOrdersCreatedThisMonth[0]?.c ?? 0n),
        completedThisMonth: Number(workOrdersCompletedThisMonth[0]?.c ?? 0n),
      },
      storage: {
        totalBytes: Number(storageBytes[0]?.c ?? 0n),
      },
    };
  }

  /**
   * Per-tenant usage snapshot (B7.7).
   *
   * One row per tenant : identity, plan, current counters vs. quotas, and
   * activity signals (active sessions, last login, last BT). Powers the
   * SA dashboard's per-tenant breakdown so the SA can see at a glance who
   * is close to quota, who is dormant, and where storage is concentrated.
   *
   * "Active sessions" = distinct users with at least one valid (not revoked,
   * not expired) refresh token — the closest proxy we have for "currently
   * connected" without adding a websocket presence layer.
   *
   * A single SQL with subqueries — N tenants is small (<100 in any realistic
   * self-hosted or SaaS deployment), so the N+1 cost is fine and keeps the
   * code obvious. If the SaaS grows past that, switch to materialized
   * counters refreshed by the quota service.
   */
  @Get('tenants')
  @ApiOperation({
    summary: 'Snapshot per-tenant — ressources / utilisateurs / sessions',
  })
  async perTenant() {
    type Row = {
      id: string;
      slug: string;
      name: string;
      plan: string;
      is_active: boolean;
      max_users: number;
      max_work_orders_per_month: number;
      max_storage_mb: number;
      max_clients: number;
      current_storage_bytes: bigint;
      created_at: Date;
      active_users: bigint;
      active_sessions: bigint;
      clients_count: bigint;
      work_orders_this_month: bigint;
      work_orders_total: bigint;
      last_login_at: Date | null;
      last_work_order_at: Date | null;
    };

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         t.id, t.slug, t.name, t.plan::text AS plan, t.is_active,
         t.max_users, t.max_work_orders_per_month, t.max_storage_mb,
         t.max_clients, t.current_storage_bytes, t.created_at,
         (SELECT count(*)::bigint FROM users u
            WHERE u.tenant_id = t.id AND u.is_active = true) AS active_users,
         (SELECT count(DISTINCT r.user_id)::bigint FROM refresh_tokens r
            WHERE r.tenant_id = t.id
              AND r.revoked_at IS NULL
              AND r.expires_at > NOW()) AS active_sessions,
         (SELECT count(*)::bigint FROM clients c
            WHERE c.tenant_id = t.id) AS clients_count,
         (SELECT count(*)::bigint FROM work_orders w
            WHERE w.tenant_id = t.id
              AND w.created_at >= date_trunc('month', CURRENT_TIMESTAMP))
              AS work_orders_this_month,
         (SELECT count(*)::bigint FROM work_orders w
            WHERE w.tenant_id = t.id) AS work_orders_total,
         (SELECT MAX(r.created_at) FROM refresh_tokens r
            WHERE r.tenant_id = t.id) AS last_login_at,
         (SELECT MAX(w.created_at) FROM work_orders w
            WHERE w.tenant_id = t.id) AS last_work_order_at
       FROM tenants t
       ORDER BY t.created_at ASC`,
    );

    return {
      data: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        plan: r.plan,
        isActive: r.is_active,
        users: {
          active: Number(r.active_users),
          max: r.max_users,
          sessions: Number(r.active_sessions),
        },
        workOrders: {
          thisMonth: Number(r.work_orders_this_month),
          max: r.max_work_orders_per_month,
          total: Number(r.work_orders_total),
        },
        storage: {
          bytes: Number(r.current_storage_bytes),
          maxMb: r.max_storage_mb,
        },
        clients: {
          count: Number(r.clients_count),
          max: r.max_clients,
        },
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
        lastWorkOrderAt: r.last_work_order_at,
      })),
    };
  }
}
