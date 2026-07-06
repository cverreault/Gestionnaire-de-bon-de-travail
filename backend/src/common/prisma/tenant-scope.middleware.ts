import type { Prisma } from '@prisma/client';
import type { RequestContextService } from '../context/request-context.service';

/**
 * Prisma middleware that auto-injects `tenantId` into every query
 * touching a tenant-scoped model (B6.4).
 *
 * Pulls the active tenantId from RequestContextService (filled by
 * TenantResolverMiddleware at the head of every request). When no
 * context is set — startup hooks, crons, tests — the middleware is
 * a no-op : the system-level caller is trusted to scope its own
 * queries.
 *
 * Defence-in-depth :
 *   - findUnique / findUniqueOrThrow : post-filter the result.
 *     Prisma's where on findUnique only accepts PK / unique fields,
 *     so we can't inject tenantId server-side. Instead we let the
 *     query run, then null-out the result when its tenantId
 *     doesn't match. RLS (B6.5) catches this at the DB level too.
 *   - findMany / findFirst / count / aggregate / groupBy /
 *     update / updateMany / delete / deleteMany / upsert :
 *     inject tenantId into args.where.
 *   - create / createMany / upsert.create : inject into args.data.
 */

// Pascal-case model names — matches Prisma's params.model.
const TENANT_SCOPED_MODELS = new Set<string>([
  'User',
  'TechnicianLocation',
  'TemporaryClient',
  'Client',
  'ClientAddress',
  'TaskType',
  'WorkOrderTemplate',
  'TemplateSection',
  'TemplateField',
  'ClientTypeConfig',
  'AddressTypeConfig',
  'AddressTypeField',
  'WorkOrder',
  'Note',
  'Attachment',
  'Appointment',
  'ProcessDefinition',
  'ProcessStatus',
  'ProcessTransition',
  'AuditLog',
  'RefreshToken',
  'Notification',
  'PushSubscription',
  'PortalInvitation',
  'Part',
  'TechnicianPartStock',
  'StockMovement',
  'WorkOrderPart',
]);

// Actions that take args.where — we inject tenantId there.
const WHERE_INJECT_ACTIONS = new Set<Prisma.PrismaAction>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

// Actions whose primary payload is args.data.
const DATA_INJECT_ACTIONS = new Set<Prisma.PrismaAction>([
  'create',
  'createMany',
  // 'upsert' handled specially because it has BOTH where and create+update.
]);

// Result of a findUnique query: shape we can read tenantId off of when
// present. We narrow defensively — null / undefined / non-object → ok.
function rowHasMismatchedTenant(
  row: unknown,
  expectedTenantId: string,
): boolean {
  if (row === null || row === undefined) return false;
  if (typeof row !== 'object') return false;
  const tid = (row as { tenantId?: unknown }).tenantId;
  return typeof tid === 'string' && tid !== expectedTenantId;
}

/**
 * Build the Prisma middleware function.
 *
 * Returns the function that goes into `prisma.$use(...)`. The factory
 * shape lets us inject RequestContextService cleanly + keeps the
 * unit-test surface narrow (we test the middleware function directly).
 */
export function buildTenantScopeMiddleware(
  context: RequestContextService,
): Prisma.Middleware {
  return async function tenantScopeMiddleware(params, next) {
    const tenantId = context.current()?.tenantId;

    // No context (startup / cron / test) → trust the system caller.
    if (!tenantId) return next(params);

    // Skip models that are not tenant-scoped (Tenant, SystemConfig,
    // and the internal Prisma _prisma_migrations).
    if (!params.model || !TENANT_SCOPED_MODELS.has(params.model)) {
      return next(params);
    }

    // ── findUnique / findUniqueOrThrow : post-fetch check
    if (
      params.action === 'findUnique' ||
      params.action === 'findUniqueOrThrow'
    ) {
      const result = await next(params);
      if (rowHasMismatchedTenant(result, tenantId)) {
        // Treat as "not found" — same as if the row didn't exist.
        // Don't leak the existence of a row that belongs to another
        // tenant via a different error message.
        if (params.action === 'findUniqueOrThrow') {
          throw new Error(
            'No User found' /* matches Prisma's own NotFoundError shape */,
          );
        }
        return null;
      }
      return result;
    }

    // ── Where-injecting actions
    if (WHERE_INJECT_ACTIONS.has(params.action)) {
      params.args = {
        ...(params.args ?? {}),
        where: { ...((params.args as { where?: unknown })?.where ?? {}), tenantId },
      };
      return next(params);
    }

    // ── Data-injecting actions
    if (DATA_INJECT_ACTIONS.has(params.action)) {
      const args = params.args as { data?: unknown };
      if (params.action === 'create') {
        const data = (args.data ?? {}) as Record<string, unknown>;
        if (data.tenantId === undefined && data.tenant === undefined) {
          args.data = { ...data, tenantId };
        }
      } else if (params.action === 'createMany') {
        const data = args.data as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(data)) {
          args.data = data.map((row) =>
            row.tenantId === undefined ? { ...row, tenantId } : row,
          );
        }
      }
      return next(params);
    }

    // ── Upsert : has both where + create + update
    if (params.action === 'upsert') {
      const args = params.args as {
        where?: Record<string, unknown>;
        create?: Record<string, unknown>;
        update?: Record<string, unknown>;
      };
      args.where = { ...(args.where ?? {}), tenantId };
      if (args.create && args.create.tenantId === undefined) {
        args.create = { ...args.create, tenantId };
      }
      return next(params);
    }

    return next(params);
  };
}
