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
}
