import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PrimaryAdminGuard — gate a route to a tenant's "primary" ADMIN only (B7.9).
 *
 * The primary admin is defined as the *first* active ADMIN by
 * `created_at ASC` within a tenant — the same account SA impersonation
 * auto-selects when it enters a tenant. Semantically this is the
 * "account owner", the one who signed the tenant up.
 *
 * Applied AFTER `JwtAuthGuard` (via the guard order in the controller
 * decorator) — the current user is already resolved on the request.
 *
 * Raw SQL to identify the first admin so the tenant-scope middleware
 * doesn't rewrite the WHERE clause.
 */
@Injectable()
export class PrimaryAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { id: string; tenantId: string; role: Role } | undefined;

    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Réservé à l\'administrateur principal du tenant',
      );
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM users
       WHERE tenant_id = $1 AND role = 'ADMIN' AND is_active = true
       ORDER BY created_at ASC
       LIMIT 1`,
      user.tenantId,
    );
    const primary = rows[0]?.id;
    if (!primary || primary !== user.id) {
      throw new ForbiddenException(
        'Réservé à l\'administrateur principal du tenant',
      );
    }
    return true;
  }
}
