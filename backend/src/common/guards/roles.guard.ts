import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface JwtUserRef {
  id?: string;
  role?: Role;
}

@Injectable()
export class RolesGuard implements CanActivate {
  // Dedicated channel: the operator can grep `security.access.denied` to find
  // RBAC refusals. Pino redacts request.authorization automatically.
  private readonly logger = new Logger('security.access.denied');

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: JwtUserRef }>();
    const user = req.user;
    const allowed = requiredRoles.some((role) => user?.role === role);

    if (!allowed) {
      // Structured warn — surfaces RBAC refusals so we can spot scans
      // (a TECHNICIAN hitting many ADMIN endpoints in a short window, etc.)
      // without scraping Express access logs.
      this.logger.warn(
        `RBAC denied: user=${user?.id ?? 'anonymous'} role=${user?.role ?? 'none'} ` +
        `required=[${requiredRoles.join(',')}] ${req.method} ${req.url}`,
      );
    }

    return allowed;
  }
}
