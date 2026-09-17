/**
 * QA — super-admin-platform-users.controller.spec.ts (B7.6)
 *
 * Locks the contract :
 *   1. POST /super-admin/platform-users
 *      - happy path : raw INSERT runs against DEFAULT, audit event emitted
 *      - 409 when the email already exists for the DEFAULT tenant
 *      - role is hardcoded SUPER_ADMIN server-side (DTO does not expose it)
 *      - new SA always lands in the DEFAULT tenant by convention
 *   2. GET /super-admin/platform-users
 *      - returns rows mapped to camelCase
 *      - empty list returns { data: [] } (not null)
 *
 * The controller uses $queryRawUnsafe everywhere to bypass the
 * tenant-scope middleware — these tests verify the SQL hits the right
 * columns and the audit event payload is well-formed.
 */

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  PLATFORM_SUPER_ADMIN_CREATED,
  PLATFORM_SUPER_ADMIN_DELETED,
  PLATFORM_SUPER_ADMIN_PASSWORD_RESET,
  PLATFORM_SUPER_ADMIN_SUSPENDED,
  PLATFORM_SUPER_ADMIN_TOTP_RESET,
  PLATFORM_SUPER_ADMIN_UPDATED,
  SuperAdminPlatformUsersController,
} from './super-admin-platform-users.controller';
import { DEFAULT_TENANT_ID } from '../../../common/contracts/tenant-context.contract';

function makePrisma() {
  return { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
}
function makeEmitter() {
  return { emit: jest.fn() };
}
type MockPrisma = ReturnType<typeof makePrisma>;
type MockEmitter = ReturnType<typeof makeEmitter>;

function make(
  prisma: MockPrisma,
  emitter: MockEmitter,
): SuperAdminPlatformUsersController {
  return new SuperAdminPlatformUsersController(
    prisma as unknown as never,
    emitter as unknown as never,
  );
}

const actor = { id: 'sa-1' };

describe('SuperAdminPlatformUsersController', () => {
  describe('list', () => {
    it('maps snake_case rows to camelCase', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          id: 'u-1',
          email: 'a@x.io',
          first_name: 'A',
          last_name: 'X',
          phone: null,
          is_active: true,
          created_at: new Date('2026-01-01'),
        },
      ]);
      const result = await make(prisma, makeEmitter()).list();
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        id: 'u-1',
        email: 'a@x.io',
        firstName: 'A',
        lastName: 'X',
        phone: null,
        isActive: true,
        createdAt: expect.any(Date),
      });
      // The query must scope to SUPER_ADMIN only — defence against listing
      // every user in the platform if someone deletes the WHERE clause.
      const call = prisma.$queryRawUnsafe.mock.calls[0];
      expect(call[0]).toMatch(/role\s*=\s*'SUPER_ADMIN'/i);
    });

    it('returns an empty array when there are no SAs', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      const result = await make(prisma, makeEmitter()).list();
      expect(result).toEqual({ data: [] });
    });
  });

  describe('create', () => {
    const dto = {
      email: 'new@x.io',
      password: 'longenough',
      firstName: 'New',
      lastName: 'SA',
    };

    it('inserts the new SA with role SUPER_ADMIN in the DEFAULT tenant', async () => {
      const prisma = makePrisma();
      // 1st call: email-clash check returns nothing
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      // 2nd call: the INSERT returns the new row
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          id: 'u-new',
          email: dto.email,
          first_name: dto.firstName,
          last_name: dto.lastName,
          phone: null,
          is_active: true,
          created_at: new Date('2026-06-30'),
        },
      ]);
      const emitter = makeEmitter();

      const out = await make(prisma, emitter).create(actor, dto);

      // INSERT must hit role = SUPER_ADMIN and the DEFAULT tenant — the DTO
      // exposes neither, so this is the only place those values come from.
      const insertCall = prisma.$queryRawUnsafe.mock.calls[1];
      expect(insertCall[0]).toMatch(/INSERT\s+INTO\s+users/i);
      expect(insertCall[0]).toMatch(/'SUPER_ADMIN'/i);
      expect(insertCall[1]).toBe(DEFAULT_TENANT_ID);
      expect(insertCall[2]).toBe(dto.email);

      // Audit event fires once, well-shaped.
      expect(emitter.emit).toHaveBeenCalledTimes(1);
      const [eventName, payload] = emitter.emit.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(eventName).toBe(PLATFORM_SUPER_ADMIN_CREATED);
      expect(payload).toMatchObject({
        aggregateId: 'u-new',
        actorUserId: actor.id,
        tenantId: DEFAULT_TENANT_ID,
        data: expect.objectContaining({ email: dto.email }),
      });

      expect(out.email).toBe(dto.email);
      expect(out.id).toBe('u-new');
    });

    it('rejects with 409 when an SA already has this email', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'u-existing' }]);
      const emitter = makeEmitter();

      await expect(
        make(prisma, emitter).create(actor, dto),
      ).rejects.toThrow(ConflictException);
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('only checks email clashes within the DEFAULT tenant', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          id: 'u-1',
          email: dto.email,
          first_name: 'A',
          last_name: 'B',
          phone: null,
          is_active: true,
          created_at: new Date(),
        },
      ]);

      await make(prisma, makeEmitter()).create(actor, dto);

      const clashCall = prisma.$queryRawUnsafe.mock.calls[0];
      expect(clashCall[1]).toBe(DEFAULT_TENANT_ID);
      expect(clashCall[2]).toBe(dto.email);
    });
  });

  // ── Mutations on an existing SA (B39) ──────────────────────────────────

  const saRow = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'u-2',
    email: 'other@x.io',
    first_name: 'Other',
    last_name: 'SA',
    phone: null,
    is_active: true,
    totp_enabled: false,
    created_at: new Date('2026-06-30'),
    ...over,
  });

  describe('update', () => {
    it('404s when the id is not a SUPER_ADMIN (no probing of tenant users)', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]); // findSuperAdmin
      await expect(
        make(prisma, makeEmitter()).update(actor, 'u-2', { firstName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the row, restricts the UPDATE to role SUPER_ADMIN and emits an audit event', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow()]); // findSuperAdmin
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow({ first_name: 'Renamed' })]); // UPDATE
      const emitter = makeEmitter();

      const out = await make(prisma, emitter).update(actor, 'u-2', { firstName: 'Renamed' });

      const updateCall = prisma.$queryRawUnsafe.mock.calls[1];
      expect(updateCall[0]).toMatch(/UPDATE\s+users/i);
      expect(updateCall[0]).toMatch(/role = 'SUPER_ADMIN'/);
      expect(updateCall[1]).toBe('u-2');
      expect(out.firstName).toBe('Renamed');
      expect(emitter.emit).toHaveBeenCalledWith(
        PLATFORM_SUPER_ADMIN_UPDATED,
        expect.objectContaining({ aggregateId: 'u-2', actorUserId: actor.id }),
      );
    });

    it('409s when the new email belongs to another platform user', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow()]); // findSuperAdmin
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'u-3' }]); // clash
      await expect(
        make(prisma, makeEmitter()).update(actor, 'u-2', { email: 'taken@x.io' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resetPassword', () => {
    it('hashes the password, revokes every refresh token and emits an audit event', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow()]); // findSuperAdmin
      prisma.$executeRawUnsafe.mockResolvedValue(1);
      const emitter = makeEmitter();

      await make(prisma, emitter).resetPassword(actor, 'u-2', { newPassword: 'longenough' });

      const [pwdCall, revokeCall] = prisma.$executeRawUnsafe.mock.calls;
      expect(pwdCall[0]).toMatch(/SET password/i);
      expect(pwdCall[2]).not.toBe('longenough'); // stored hashed, never in clear
      expect(revokeCall[0]).toMatch(/UPDATE refresh_tokens SET revoked_at/i);
      expect(revokeCall[1]).toBe('u-2');
      expect(emitter.emit).toHaveBeenCalledWith(
        PLATFORM_SUPER_ADMIN_PASSWORD_RESET,
        expect.objectContaining({ aggregateId: 'u-2' }),
      );
    });
  });

  describe('suspend', () => {
    it('403s when an SA tries to suspend themself', async () => {
      const prisma = makePrisma();
      await expect(
        make(prisma, makeEmitter()).suspend(actor, actor.id),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('409s when the target is the last active SA', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow()]); // findSuperAdmin
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 0 }]); // others active
      await expect(
        make(prisma, makeEmitter()).suspend(actor, 'u-2'),
      ).rejects.toThrow(ConflictException);
    });

    it('sets is_active=false, revokes sessions and emits an audit event', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow()]); // findSuperAdmin
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 1 }]); // others active
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow({ is_active: false })]); // UPDATE
      prisma.$executeRawUnsafe.mockResolvedValue(1);
      const emitter = makeEmitter();

      const out = await make(prisma, emitter).suspend(actor, 'u-2');

      expect(prisma.$queryRawUnsafe.mock.calls[2][0]).toMatch(/is_active = false/);
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toMatch(/refresh_tokens/);
      expect(out.isActive).toBe(false);
      expect(emitter.emit).toHaveBeenCalledWith(
        PLATFORM_SUPER_ADMIN_SUSPENDED,
        expect.objectContaining({ aggregateId: 'u-2' }),
      );
    });
  });

  describe('reactivate', () => {
    it('sets is_active=true without touching sessions', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow({ is_active: false })]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow({ is_active: true })]);

      const out = await make(prisma, makeEmitter()).reactivate(actor, 'u-2');

      expect(prisma.$queryRawUnsafe.mock.calls[1][0]).toMatch(/is_active = true/);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(out.isActive).toBe(true);
    });
  });

  describe('resetTotp', () => {
    it('clears every TOTP column and emits an audit event', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow({ totp_enabled: true })]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow({ totp_enabled: false })]);
      const emitter = makeEmitter();

      const out = await make(prisma, emitter).resetTotp(actor, 'u-2');

      const sql = prisma.$queryRawUnsafe.mock.calls[1][0] as string;
      expect(sql).toMatch(/totp_secret = NULL/);
      expect(sql).toMatch(/totp_enabled = false/);
      expect(sql).toMatch(/totp_backup_codes_hash = NULL/);
      expect(out.totpEnabled).toBe(false);
      expect(emitter.emit).toHaveBeenCalledWith(
        PLATFORM_SUPER_ADMIN_TOTP_RESET,
        expect.objectContaining({ aggregateId: 'u-2' }),
      );
    });
  });

  describe('remove', () => {
    it('403s on self-deletion', async () => {
      await expect(
        make(makePrisma(), makeEmitter()).remove(actor, actor.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('409s when the target is the last active SA', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow()]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 0 }]);
      await expect(
        make(prisma, makeEmitter()).remove(actor, 'u-2'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('revokes sessions, hard-deletes the row and emits an audit event', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow()]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 2 }]);
      prisma.$executeRawUnsafe.mockResolvedValue(1);
      const emitter = makeEmitter();

      await make(prisma, emitter).remove(actor, 'u-2');

      const [revokeCall, deleteCall] = prisma.$executeRawUnsafe.mock.calls;
      expect(revokeCall[0]).toMatch(/refresh_tokens/);
      expect(deleteCall[0]).toMatch(/DELETE FROM users WHERE id = \$1 AND role = 'SUPER_ADMIN'/);
      expect(emitter.emit).toHaveBeenCalledWith(
        PLATFORM_SUPER_ADMIN_DELETED,
        expect.objectContaining({ aggregateId: 'u-2', data: { email: 'other@x.io' } }),
      );
    });

    it('translates a foreign-key violation into a 409 (suspend instead)', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([saRow()]);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 2 }]);
      prisma.$executeRawUnsafe.mockResolvedValueOnce(1); // revoke
      prisma.$executeRawUnsafe.mockRejectedValueOnce(Object.assign(new Error('fk'), { meta: { code: '23503' } }));
      const emitter = makeEmitter();

      await expect(
        make(prisma, emitter).remove(actor, 'u-2'),
      ).rejects.toThrow(ConflictException);
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });

  // Reference Role enum to keep TS happy when nothing else does.
  it('Role enum is reachable', () => {
    expect(Role.SUPER_ADMIN).toBe('SUPER_ADMIN');
  });
});
