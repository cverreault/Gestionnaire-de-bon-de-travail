import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequestContextService } from '../context/request-context.service';
import { buildTenantScopeMiddleware } from './tenant-scope.middleware';
import { buildBilingualSyncMiddleware } from './bilingual-sync.middleware';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly context: RequestContextService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    // Install the tenant-scope auto-filter middleware (B6.4). Every
    // query touching a tenant-scoped model now inherits the active
    // tenantId from the AsyncLocalStorage scope set by
    // TenantResolverMiddleware. Background hooks (cron, seed, SA
    // bootstrap) run without context and stay unscoped.
    this.$use(buildTenantScopeMiddleware(this.context));
    this.$use(buildBilingualSyncMiddleware());
    this.logger.log('✅ Prisma connected to PostgreSQL');
    this.logger.log('🛡️  Tenant-scope middleware installed');
    this.logger.log('🌐 Bilingual-sync middleware installed');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Prisma disconnected from PostgreSQL');
  }

  /**
   * Run a callback inside a transaction with `app.tenant_id` set on
   * the Postgres session for the duration (B6.5).
   *
   * The RLS policies installed in migration 20260629130000 read this
   * GUC to filter every row visible inside the transaction. Callers
   * who care about the second-line defence (sensitive `$queryRaw`,
   * cross-tenant audits) wrap the work in this helper :
   *
   *   await prisma.withTenantScope(tenantId, async (tx) => {
   *     return tx.$queryRaw`SELECT * FROM work_orders`;
   *   });
   *
   * Outside this helper, queries still go through the application
   * middleware (B6.4) — RLS allows them because the GUC is unset.
   */
  async withTenantScope<R>(
    tenantId: string,
    callback: (tx: PrismaClient) => Promise<R>,
  ): Promise<R> {
    return this.$transaction(async (tx) => {
      // set_config(name, value, is_local) — third arg true scopes the
      // setting to the current transaction, matching SET LOCAL.
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.tenant_id', $1, true)`,
        tenantId,
      );
      return callback(tx as unknown as PrismaClient);
    });
  }

  /**
   * Utility to clean all tables in test environments.
   * Never call this in production.
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase() is not allowed in production');
    }
    const tablenames = await this.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    for (const { tablename } of tablenames) {
      if (tablename !== '_prisma_migrations') {
        await this.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
      }
    }
  }
}
