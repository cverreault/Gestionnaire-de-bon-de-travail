import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Roles } from '../../../common/decorators/roles.decorator';

/**
 * Cross-tenant audit log search (B7).
 *
 * GET /super-admin/audit lets the SA answer "what happened at customer X
 * yesterday at 3pm" without losing the tenant scope entirely (every row
 * still carries its tenantSlug for context).
 *
 * Filters :
 *   - from / to (ISO timestamps) — clamped to bounds-inclusive
 *   - tenantSlug (exact) — bridges via tenants.slug
 *   - actor (exact user id) — matches actor_user_id
 *   - eventName (prefix match, % appended)
 *
 * Paginated. Default 50/page, max 100. ORDER BY occurred_at DESC so
 * the most recent rows are on page 1.
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/audit')
export class SuperAdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Recherche dans les audit logs cross-tenant' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'tenantSlug', required: false, type: String })
  @ApiQuery({ name: 'actor', required: false, type: String })
  @ApiQuery({ name: 'eventName', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: String })
  async search(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantSlug') tenantSlug?: string,
    @Query('actor') actor?: string,
    @Query('eventName') eventName?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const take = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
    const skip = (Math.max(1, Number.parseInt(page, 10) || 1) - 1) * take;

    // Dynamic WHERE — collect predicates + params, then concatenate.
    // No string-interpolation of user input ; everything goes through
    // parameter slots ($1, $2, …).
    const clauses: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, value: unknown) => {
      params.push(value);
      clauses.push(sql.replace('?', `$${params.length}`));
    };

    if (from) push(`a.occurred_at >= ?::timestamptz`, from);
    if (to) push(`a.occurred_at <= ?::timestamptz`, to);
    if (tenantSlug) push(`t.slug = ?`, tenantSlug);
    if (actor) push(`a.actor_user_id = ?`, actor);
    if (eventName) push(`a.event_name LIKE ? || '%'`, eventName);

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    type Row = {
      id: string;
      event_name: string;
      aggregate_id: string | null;
      occurred_at: Date;
      actor_user_id: string | null;
      data: unknown;
      tenant_id: string;
      tenant_slug: string;
    };

    const rowsSql = `
      SELECT
        a.id, a.event_name, a.aggregate_id, a.occurred_at,
        a.actor_user_id, a.data, a.tenant_id, t.slug AS tenant_slug
      FROM audit_logs a
      LEFT JOIN tenants t ON t.id = a.tenant_id
      ${where}
      ORDER BY a.occurred_at DESC
      OFFSET $${params.length + 1} LIMIT $${params.length + 2}
    `;
    const countSql = `
      SELECT count(*)::bigint AS c
      FROM audit_logs a
      LEFT JOIN tenants t ON t.id = a.tenant_id
      ${where}
    `;

    const [rows, totalRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Row[]>(rowsSql, ...params, skip, take),
      this.prisma.$queryRawUnsafe<Array<{ c: bigint }>>(countSql, ...params),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        eventName: r.event_name,
        aggregateId: r.aggregate_id,
        occurredAt: r.occurred_at,
        actorUserId: r.actor_user_id,
        data: r.data,
        tenantId: r.tenant_id,
        tenantSlug: r.tenant_slug,
      })),
      pagination: {
        page: Number.parseInt(page, 10) || 1,
        limit: take,
        total: Number(totalRows[0]?.c ?? 0n),
      },
    };
  }
}
