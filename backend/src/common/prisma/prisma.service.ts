import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequestContextService } from '../context/request-context.service';
import { buildTenantScopeMiddleware } from './tenant-scope.middleware';

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
    this.logger.log('✅ Prisma connected to PostgreSQL');
    this.logger.log('🛡️  Tenant-scope middleware installed');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Prisma disconnected from PostgreSQL');
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
