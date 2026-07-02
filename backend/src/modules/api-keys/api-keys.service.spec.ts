/**
 * QA — api-keys.service.spec.ts (B8)
 *
 * Locks the security-critical bits :
 *   1. Plaintext format & entropy — prefix + 32 random bytes
 *   2. Storage: only the SHA-256 hash reaches the DB
 *   3. `resolveByPlaintext` rejects unknown / revoked / expired keys
 *   4. `assertScopeSatisfies` respects the `admin ⊇ read-write ⊇ read-only`
 *      hierarchy
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiKeysService } from './api-keys.service';

function makePrisma() {
  return {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };
}
function makeEmitter() {
  return { emit: jest.fn() };
}
type MockPrisma = ReturnType<typeof makePrisma>;
type MockEmitter = ReturnType<typeof makeEmitter>;

function make(prisma: MockPrisma, emitter: MockEmitter): ApiKeysService {
  return new ApiKeysService(prisma as unknown as never, emitter as unknown as never);
}

describe('ApiKeysService', () => {
  describe('mint', () => {
    it('generates a plaintext with the tkm_ prefix and stores only its hash', async () => {
      const prisma = makePrisma();
      prisma.apiKey.create.mockResolvedValueOnce({
        id: 'k-1',
        name: 'Test',
        scope: 'read-write',
        keyPrefix: 'tkm_dev_abcdef01',
        expiresAt: null,
        createdAt: new Date('2026-07-02'),
      });

      const emitter = makeEmitter();
      const result = await make(prisma, emitter).mint({
        tenantId: 't-1',
        createdByUserId: 'u-admin',
        name: 'Test',
        scope: 'read-write',
      });

      expect(result.plaintext).toMatch(/^tkm_(dev|live)_[A-Za-z0-9_-]{40,}$/);

      // The plaintext must NOT be in the create call — only the hash.
      const createArgs = prisma.apiKey.create.mock.calls[0][0];
      expect(createArgs.data.keyHash).toHaveLength(64); // sha256 hex
      expect(createArgs.data.keyHash).toBe(
        createHash('sha256').update(result.plaintext).digest('hex'),
      );
      expect(JSON.stringify(createArgs)).not.toContain(result.plaintext);

      // The prefix written to the DB must equal the first 16 chars of the
      // plaintext — that's how admins can identify a key without knowing
      // its full value.
      expect(createArgs.data.keyPrefix).toBe(result.plaintext.slice(0, 16));

      // Audit event emitted with the key metadata.
      expect(emitter.emit).toHaveBeenCalledWith(
        'apiIntegration.key.created',
        expect.objectContaining({
          aggregateId: 'k-1',
          tenantId: 't-1',
          data: expect.objectContaining({ name: 'Test', scope: 'read-write' }),
        }),
      );
    });

    it('rejects an invalid scope', async () => {
      const prisma = makePrisma();
      const emitter = makeEmitter();
      await expect(
        make(prisma, emitter).mint({
          tenantId: 't-1',
          createdByUserId: 'u-admin',
          name: 'Test',
          // @ts-expect-error — deliberately invalid at compile time
          scope: 'super-admin',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.apiKey.create).not.toHaveBeenCalled();
    });
  });

  describe('resolveByPlaintext', () => {
    it('returns the key when hash matches, not revoked, not expired', async () => {
      const prisma = makePrisma();
      const plaintext = 'tkm_dev_test-plaintext-value-that-is-long-enough';
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          id: 'k-1',
          tenant_id: 't-1',
          name: 'Test',
          scope: 'read-write',
          expires_at: null,
          revoked_at: null,
          created_by_user_id: 'u-admin',
        },
      ]);
      const result = await make(prisma, makeEmitter()).resolveByPlaintext(plaintext);
      expect(result).toEqual({
        id: 'k-1',
        tenantId: 't-1',
        name: 'Test',
        scope: 'read-write',
        createdByUserId: 'u-admin',
      });
    });

    it('returns null for missing / short / wrong-prefix input', async () => {
      const prisma = makePrisma();
      const svc = make(prisma, makeEmitter());
      expect(await svc.resolveByPlaintext('')).toBeNull();
      expect(await svc.resolveByPlaintext('bearer xxx')).toBeNull();
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('returns null when the hash is unknown', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      expect(
        await make(prisma, makeEmitter()).resolveByPlaintext('tkm_dev_unknown'),
      ).toBeNull();
    });

    it('returns null when the key is revoked', async () => {
      const prisma = makePrisma();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          id: 'k-1',
          tenant_id: 't-1',
          name: 'Test',
          scope: 'read-write',
          expires_at: null,
          revoked_at: new Date('2026-06-01'),
          created_by_user_id: 'u',
        },
      ]);
      expect(
        await make(prisma, makeEmitter()).resolveByPlaintext('tkm_dev_x'),
      ).toBeNull();
    });

    it('returns null when the key is expired', async () => {
      const prisma = makePrisma();
      const past = new Date(Date.now() - 60_000);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          id: 'k-1',
          tenant_id: 't-1',
          name: 'Test',
          scope: 'read-write',
          expires_at: past,
          revoked_at: null,
          created_by_user_id: 'u',
        },
      ]);
      expect(
        await make(prisma, makeEmitter()).resolveByPlaintext('tkm_dev_x'),
      ).toBeNull();
    });
  });

  describe('assertScopeSatisfies', () => {
    const svc = () => make(makePrisma(), makeEmitter());

    it('read-only accepts read-only, rejects read-write / admin as insufficient', () => {
      expect(() => svc().assertScopeSatisfies('read-only', 'read-only')).not.toThrow();
      expect(() => svc().assertScopeSatisfies('read-write', 'read-only')).not.toThrow();
      expect(() => svc().assertScopeSatisfies('admin', 'read-only')).not.toThrow();
    });

    it('read-write rejects read-only', () => {
      expect(() => svc().assertScopeSatisfies('read-only', 'read-write')).toThrow(
        ForbiddenException,
      );
      expect(() => svc().assertScopeSatisfies('read-write', 'read-write')).not.toThrow();
      expect(() => svc().assertScopeSatisfies('admin', 'read-write')).not.toThrow();
    });

    it('admin rejects read-only and read-write', () => {
      expect(() => svc().assertScopeSatisfies('read-only', 'admin')).toThrow(
        ForbiddenException,
      );
      expect(() => svc().assertScopeSatisfies('read-write', 'admin')).toThrow(
        ForbiddenException,
      );
      expect(() => svc().assertScopeSatisfies('admin', 'admin')).not.toThrow();
    });

    it('rejects a bogus actual scope', () => {
      expect(() => svc().assertScopeSatisfies('nonsense', 'read-only')).toThrow(
        ForbiddenException,
      );
    });
  });
});
