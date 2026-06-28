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
import { SECURITY_EVENT_NAMES } from '../events/security-events';

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
  let emit: jest.Mock;

  beforeEach(() => {
    emit = jest.fn();
    const eventEmitter = { emit } as any;
    guard = new RolesGuard(new Reflector(), eventEmitter);
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

    // C13 persistence: the guard also publishes a domain event so the
    // audit module captures the refusal in the searchable timeline.
    expect(emit).toHaveBeenCalledTimes(1);
    const [eventName, payload] = emit.mock.calls[0];
    expect(eventName).toBe(SECURITY_EVENT_NAMES.ACCESS_DENIED);
    expect(payload).toMatchObject({
      name: SECURITY_EVENT_NAMES.ACCESS_DENIED,
      actorUserId: 'u-tech-42',
      aggregateId: 'GET /api/users',
      data: {
        method: 'GET',
        url: '/api/users',
        requiredRoles: ['ADMIN'],
        actualRole: 'TECHNICIAN',
      },
    });
    expect(typeof payload.eventId).toBe('string');
    expect(payload.occurredAt).toBeInstanceOf(Date);
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

    // Anonymous denials emit the same event with actorUserId=null
    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0][1];
    expect(payload.actorUserId).toBeNull();
    expect(payload.data.actualRole).toBe('none');
  });

  it('works without an EventEmitter (optional injection)', () => {
    // Some unit tests construct the guard with only the Reflector. Make
    // sure the deny path doesn't crash when the emitter is absent.
    const bareGuard = new RolesGuard(new Reflector());
    const ctx = buildContext({
      metadata: [Role.ADMIN],
      user: { id: 'u-tech', role: Role.TECHNICIAN },
      method: 'GET',
      url: '/api/users',
    });
    spyOnGuardLogger(bareGuard);
    expect(() => bareGuard.canActivate(ctx)).not.toThrow();
    expect(bareGuard.canActivate(ctx)).toBe(false);
  });
});
