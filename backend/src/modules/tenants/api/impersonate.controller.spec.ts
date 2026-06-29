/**
 * QA — impersonate.controller.spec.ts (B6.11 + B7)
 *
 * Locks the two-mode contract :
 *   1. Missing both userId + tenantId → 403
 *   2. Both userId + tenantId → 403 (exclusive)
 *   3. userId mode : original B6.11 happy path + safeties
 *   4. tenantId mode (B7) :
 *      - resolves the first active ADMIN ordered by created_at ASC
 *      - 404 when no active ADMIN exists in the tenant
 *      - same SA / SUPER_ADMIN / inactive guards apply
 *   5. Response includes tenant (id, slug, name)
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ImpersonateController } from './impersonate.controller';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
  };
}

function makeJwt(signed = 'signed-jwt') {
  return {
    sign: jest.fn(() => signed),
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;
type MockJwt = ReturnType<typeof makeJwt>;

function make(prisma: MockPrisma, jwt: MockJwt): ImpersonateController {
  return new ImpersonateController(
    prisma as unknown as never,
    jwt as unknown as never,
  );
}

const sa = { id: 'sa-1', role: Role.SUPER_ADMIN };

describe('ImpersonateController', () => {
  it('throws 403 when neither userId nor tenantId is provided', async () => {
    await expect(
      make(makePrisma(), makeJwt()).impersonate(sa, {}),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws 403 when both userId and tenantId are provided', async () => {
    await expect(
      make(makePrisma(), makeJwt()).impersonate(sa, {
        userId: 'u-1',
        tenantId: 't-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  describe('userId mode', () => {
    it('returns signed access token + user + tenant on the happy path', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u-target',
        email: 'jean@x.io',
        role: Role.ADMIN,
        tenantId: 't-1',
        isActive: true,
      });
      prisma.tenant.findUnique.mockResolvedValueOnce({
        id: 't-1',
        slug: 'aco',
        name: 'A Co',
      });

      const result = await make(prisma, makeJwt('JWT')).impersonate(sa, {
        userId: 'u-target',
      });

      expect(result.accessToken).toBe('JWT');
      expect(result.user).toEqual({
        id: 'u-target',
        email: 'jean@x.io',
        tenantId: 't-1',
      });
      expect(result.tenant).toEqual({ id: 't-1', slug: 'aco', name: 'A Co' });
    });

    it('throws 404 when the user id does not exist', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        make(prisma, makeJwt()).impersonate(sa, { userId: 'u-ghost' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects impersonating self', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'sa-1',
        email: 'sa@x.io',
        role: Role.SUPER_ADMIN,
        tenantId: 't-1',
        isActive: true,
      });
      await expect(
        make(prisma, makeJwt()).impersonate(sa, { userId: 'sa-1' }),
      ).rejects.toThrow(/déjà connecté/);
    });

    it('rejects impersonating another SUPER_ADMIN', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'sa-2',
        email: 'sa2@x.io',
        role: Role.SUPER_ADMIN,
        tenantId: 't-1',
        isActive: true,
      });
      await expect(
        make(prisma, makeJwt()).impersonate(sa, { userId: 'sa-2' }),
      ).rejects.toThrow(/Impossible d'imiter/);
    });

    it('rejects inactive target', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u-target',
        email: 'jean@x.io',
        role: Role.ADMIN,
        tenantId: 't-1',
        isActive: false,
      });
      await expect(
        make(prisma, makeJwt()).impersonate(sa, { userId: 'u-target' }),
      ).rejects.toThrow(/Compte cible inactif/);
    });
  });

  describe('tenantId mode (B7)', () => {
    it('picks the first active ADMIN ordered by createdAt ASC', async () => {
      const prisma = makePrisma();
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u-admin',
        email: 'admin@aco.io',
        role: Role.ADMIN,
        tenantId: 't-aco',
        isActive: true,
      });
      prisma.tenant.findUnique.mockResolvedValueOnce({
        id: 't-aco',
        slug: 'aco',
        name: 'A Co',
      });

      const result = await make(prisma, makeJwt()).impersonate(sa, {
        tenantId: 't-aco',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 't-aco', role: Role.ADMIN, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: expect.objectContaining({ id: true, email: true, role: true }),
      });
      expect(result.user.id).toBe('u-admin');
      expect(result.tenant.slug).toBe('aco');
    });

    it('throws 404 when no active ADMIN exists in the tenant', async () => {
      const prisma = makePrisma();
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(
        make(prisma, makeJwt()).impersonate(sa, { tenantId: 't-empty' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
