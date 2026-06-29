/**
 * QA — super-admin-bootstrap.service.spec.ts
 *
 * Locks the auto-promotion contract:
 *   1. No-op when at least one SUPER_ADMIN already exists
 *   2. No-op + helpful warn when SUPER_ADMIN_EMAIL is unset
 *   3. No-op + warn when the email doesn't match any user
 *   4. No-op + warn when the matching user is inactive
 *   5. Promotes the matching ADMIN user to SUPER_ADMIN
 *   6. Never throws — DB errors are logged, app boot proceeds
 */

import { Role } from '@prisma/client';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';

interface UserRow {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
}

function makeMockPrisma(rows: UserRow[]) {
  return {
    _rows: rows,
    user: {
      count: jest.fn(({ where }: { where: { role: Role; isActive: boolean } }) =>
        Promise.resolve(rows.filter((r) => r.role === where.role && r.isActive === where.isActive).length),
      ),
      findFirst: jest.fn(({ where }: { where: { email: string } }) =>
        Promise.resolve(rows.find((r) => r.email === where.email) ?? null),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const u = rows.find((r) => r.id === where.id);
        if (!u) return Promise.reject(new Error('not found'));
        Object.assign(u, data);
        return Promise.resolve(u);
      }),
    },
  };
}

function makeConfig(email?: string) {
  return {
    get: jest.fn((key: string) => (key === 'SUPER_ADMIN_EMAIL' ? email : undefined)),
  };
}

function buildSvc(prisma: any, email?: string) {
  return new SuperAdminBootstrapService(prisma as any, makeConfig(email) as any);
}

describe('SuperAdminBootstrapService.onApplicationBootstrap', () => {
  it('no-op when at least one active SUPER_ADMIN exists', async () => {
    const prisma = makeMockPrisma([
      { id: 'sa-1', email: 'sa@x.io', role: Role.SUPER_ADMIN, isActive: true },
    ]);
    const svc = buildSvc(prisma, 'someone@else.io');

    await svc.onApplicationBootstrap();

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('no-op when SUPER_ADMIN_EMAIL is unset', async () => {
    const prisma = makeMockPrisma([
      { id: 'a-1', email: 'admin@x.io', role: Role.ADMIN, isActive: true },
    ]);
    const svc = buildSvc(prisma, undefined);

    await svc.onApplicationBootstrap();

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma._rows[0].role).toBe(Role.ADMIN); // unchanged
  });

  it('no-op when the target email does not match any user', async () => {
    const prisma = makeMockPrisma([
      { id: 'a-1', email: 'admin@x.io', role: Role.ADMIN, isActive: true },
    ]);
    const svc = buildSvc(prisma, 'ghost@x.io');

    await svc.onApplicationBootstrap();

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma._rows[0].role).toBe(Role.ADMIN);
  });

  it('no-op when the target user is inactive', async () => {
    const prisma = makeMockPrisma([
      { id: 'a-1', email: 'admin@x.io', role: Role.ADMIN, isActive: false },
    ]);
    const svc = buildSvc(prisma, 'admin@x.io');

    await svc.onApplicationBootstrap();

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma._rows[0].role).toBe(Role.ADMIN);
  });

  it('promotes the matching ADMIN to SUPER_ADMIN', async () => {
    const prisma = makeMockPrisma([
      { id: 'a-1', email: 'admin@x.io', role: Role.ADMIN, isActive: true },
    ]);
    const svc = buildSvc(prisma, 'admin@x.io');

    await svc.onApplicationBootstrap();

    expect(prisma._rows[0].role).toBe(Role.SUPER_ADMIN);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'a-1' },
      data: { role: Role.SUPER_ADMIN },
    });
  });

  it('also works when promoting a TECHNICIAN (no role hierarchy check)', async () => {
    const prisma = makeMockPrisma([
      { id: 't-1', email: 'tech@x.io', role: Role.TECHNICIAN, isActive: true },
    ]);
    const svc = buildSvc(prisma, 'tech@x.io');

    await svc.onApplicationBootstrap();

    expect(prisma._rows[0].role).toBe(Role.SUPER_ADMIN);
  });

  it('never throws when the DB layer fails', async () => {
    const prisma = makeMockPrisma([]);
    (prisma.user.count as jest.Mock).mockRejectedValueOnce(new Error('connection refused'));
    const svc = buildSvc(prisma, 'x@y.z');

    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
