/**
 * QA — roles.guard.spec.ts
 *
 * Locks the access-denied behavior shipped in C13:
 *  - canActivate returns true when @Roles is absent
 *  - canActivate returns true when the user's role is allowed
 *  - canActivate returns false AND emits a structured warn log when the role
 *    is wrong → operator can grep `security.access.denied` to detect scans
 */

import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function buildContext(opts: {
  metadata?: Role[];
  user?: { id: string; role: Role } | null;
  method?: string;
  url?: string;
}) {
  const handler = (): undefined => undefined;
  const cls = class {};
  if (opts.metadata !== undefined) {
    Reflect.defineMetadata(ROLES_KEY, opts.metadata, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({
        user: opts.user ?? undefined,
        method: opts.method ?? 'GET',
        url: opts.url ?? '/test',
      }),
    }),
  } as any;
}

function spyOnGuardLogger(guard: RolesGuard) {
  // `logger` is a private Logger instance — patch its warn method.
  const logger = (guard as unknown as { logger: { warn: (m: string) => void } }).logger;
  return jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
}

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  it('allows access when no @Roles metadata is set', () => {
    const ctx = buildContext({ user: { id: 'u', role: Role.TECHNICIAN } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when the user has a permitted role', () => {
    const ctx = buildContext({
      metadata: [Role.ADMIN, Role.DISPATCHER],
      user: { id: 'u-1', role: Role.DISPATCHER },
    });
    const warn = spyOnGuardLogger(guard);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('denies access AND emits security.access.denied when the role is wrong', () => {
    const ctx = buildContext({
      metadata: [Role.ADMIN],
      user: { id: 'u-tech-42', role: Role.TECHNICIAN },
      method: 'GET',
      url: '/api/users',
    });
    const warn = spyOnGuardLogger(guard);

    expect(guard.canActivate(ctx)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0][0] as string;
    expect(msg).toContain('RBAC denied');
    expect(msg).toContain('user=u-tech-42');
    expect(msg).toContain('role=TECHNICIAN');
    expect(msg).toContain('required=[ADMIN]');
    expect(msg).toContain('GET /api/users');
  });

  it('denies access AND emits the log when no user is on the request (anonymous)', () => {
    const ctx = buildContext({
      metadata: [Role.ADMIN],
      user: null,
      method: 'POST',
      url: '/api/users',
    });
    const warn = spyOnGuardLogger(guard);

    expect(guard.canActivate(ctx)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0][0] as string;
    expect(msg).toContain('user=anonymous');
    expect(msg).toContain('role=none');
  });
});
