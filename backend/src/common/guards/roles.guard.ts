import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  SECURITY_EVENT_NAMES,
  securityAccessDenied,
} from '../events/security-events';

interface JwtUserRef {
  id?: string;
  role?: Role;
}

@Injectable()
export class RolesGuard implements CanActivate {
  // Dedicated channel: the operator can grep `security.access.denied` to find
  // RBAC refusals. Pino redacts request.authorization automatically.
  private readonly logger = new Logger('security.access.denied');

  // EventEmitter is optional — RolesGuard is constructed by Nest's DI but
  // the guard is also instantiated by unit tests that pass only the
  // Reflector. Optional injection keeps both paths working without forcing
  // every test to wire the emitter.
  constructor(
    private reflector: Reflector,
    private readonly eventEmitter?: EventEmitter2,
  ) {}

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

    // SUPER_ADMIN inherits every ADMIN privilege (and beyond): if the
    // route requires any role at all, SA passes. Keeps the @Roles
    // decorator on existing endpoints unchanged.
    if (user?.role === Role.SUPER_ADMIN) return true;

    const allowed = requiredRoles.some((role) => user?.role === role);

    if (!allowed) {
      // Structured warn — surfaces RBAC refusals so we can spot scans
      // (a TECHNICIAN hitting many ADMIN endpoints in a short window, etc.)
      // without scraping Express access logs.
      this.logger.warn(
        `RBAC denied: user=${user?.id ?? 'anonymous'} role=${user?.role ?? 'none'} ` +
        `required=[${requiredRoles.join(',')}] ${req.method} ${req.url}`,
      );

      // Emit a domain event so the audit module persists the refusal
      // alongside the rest of the timeline (admin can grep, filter and
      // export). Fire-and-forget — the guard never blocks on the listener.
      const event = securityAccessDenied(user?.id ?? null, {
        method: req.method,
        url: req.url,
        requiredRoles: requiredRoles.map(String),
        actualRole: user?.role ?? 'none',
      });
      this.eventEmitter?.emit(SECURITY_EVENT_NAMES.ACCESS_DENIED, event);
    }

    return allowed;
  }
}
