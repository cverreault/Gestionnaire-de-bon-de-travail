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

import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  PLATFORM_SUPER_ADMIN_CREATED,
  SuperAdminPlatformUsersController,
} from './super-admin-platform-users.controller';
import { DEFAULT_TENANT_ID } from '../../../common/contracts/tenant-context.contract';

function makePrisma() {
  return { $queryRawUnsafe: jest.fn() };
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

  // Reference Role enum to keep TS happy when nothing else does.
  it('Role enum is reachable', () => {
    expect(Role.SUPER_ADMIN).toBe('SUPER_ADMIN');
  });
});
