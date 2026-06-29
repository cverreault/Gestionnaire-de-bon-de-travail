import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Promotes the user identified by SUPER_ADMIN_EMAIL to SUPER_ADMIN at
 * startup if no SUPER_ADMIN exists in the DB yet (SA.1.a).
 *
 * Why OnApplicationBootstrap and not OnModuleInit:
 *   - We need Prisma to be connected (PrismaService.onModuleInit ran)
 *   - We need the schema to be migrated (boot smoke test ran in main.ts)
 * Both are guaranteed by the time OnApplicationBootstrap fires.
 *
 * Idempotent:
 *   - If a SUPER_ADMIN already exists → no-op
 *   - If SUPER_ADMIN_EMAIL is unset → log a hint, no-op
 *   - If the email doesn't match any user → warn, no-op
 *
 * The bootstrap never demotes anyone — promotion only. Removing the
 * SUPER_ADMIN role from a user is a deliberate manual action.
 */
@Injectable()
export class SuperAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const existing = await this.prisma.user.count({
        where: { role: Role.SUPER_ADMIN, isActive: true },
      });
      if (existing > 0) {
        this.logger.log(`SUPER_ADMIN already provisioned (${existing} active)`);
        return;
      }

      const email = this.config.get<string>('SUPER_ADMIN_EMAIL');
      if (!email) {
        this.logger.warn(
          '🚨 No SUPER_ADMIN found and SUPER_ADMIN_EMAIL is unset. ' +
          'Set SUPER_ADMIN_EMAIL in the env (matching an existing ADMIN user) to bootstrap one.',
        );
        return;
      }

      // SA bootstrap reaches across every tenant — the platform owner's
      // email is unique platform-wide by convention. findFirst rather
      // than findUnique now that email is per-tenant.
      const target = await this.prisma.user.findFirst({
        where: { email },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!target) {
        this.logger.warn(
          `🚨 SUPER_ADMIN_EMAIL=${email} does not match any user — skipping promotion. ` +
          'Create the user first (POST /users) then restart.',
        );
        return;
      }

      if (!target.isActive) {
        this.logger.warn(
          `🚨 User ${email} is inactive — re-activate before promoting to SUPER_ADMIN.`,
        );
        return;
      }

      await this.prisma.user.update({
        where: { id: target.id },
        data: { role: Role.SUPER_ADMIN },
      });

      this.logger.log(
        `👑 Promoted ${email} to SUPER_ADMIN (was ${target.role}). ` +
        'Future restarts are no-ops while at least one SUPER_ADMIN exists.',
      );
    } catch (err) {
      // Never crash the app boot over this — log and move on. An operator
      // can fix the bootstrap state out-of-band (psql or POST /users).
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`SUPER_ADMIN bootstrap failed: ${message}`);
    }
  }
}
