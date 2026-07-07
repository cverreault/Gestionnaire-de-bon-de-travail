/**
 * QA — auth.service.spec.ts
 *
 * Unit tests for AuthService.login / refresh / logout covering:
 *  1. login succeeds with correct password, creates a refresh-token row
 *     under a fresh family
 *  2. login rejects unknown email / wrong password / disabled user
 *  3. refresh rotates: old row revoked, new row issued under same family
 *  4. refresh detects replay: a revoked token re-presented → kills entire
 *     family, returns 401
 *  5. refresh rejects expired rows
 *  6. refresh rejects token for inactive user and marks the row revoked
 *  7. logout best-effort-revokes the presented token
 *
 * Prisma + JwtService + ConfigService are mocked. crypto is real (so the
 * SHA-256 hashing path is exercised).
 */

import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const REFRESH_SECRET = 'test-refresh-secret';

function hashToken(t: string): string {
  return crypto.createHash('sha256').update(t).digest('hex');
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

interface MockTokenRow {
  id: string;
  tokenHash: string;
  userId: string;
  family: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

function makeMockPrisma(opts: {
  user?: {
    id: string;
    email: string;
    password: string;
    role: string;
    isActive: boolean;
    firstName?: string;
    lastName?: string;
  } | null;
  initialTokens?: MockTokenRow[];
} = {}) {
  const tokens: MockTokenRow[] = [...(opts.initialTokens ?? [])];

  return {
    _tokens: tokens, // exposed for assertions
    user: {
      findUnique: jest.fn(({ where }: { where: { email?: string; id?: string } }) => {
        if (!opts.user) return Promise.resolve(null);
        if (where.email && where.email !== opts.user.email) return Promise.resolve(null);
        if (where.id && where.id !== opts.user.id) return Promise.resolve(null);
        return Promise.resolve(opts.user);
      }),
      // B6.3 — login uses findFirst({ email, tenantId })
      findFirst: jest.fn(({ where }: { where: { email?: string } }) => {
        if (!opts.user) return Promise.resolve(null);
        if (where.email && where.email !== opts.user.email) return Promise.resolve(null);
        return Promise.resolve(opts.user);
      }),
    },
    refreshToken: {
      create: jest.fn(({ data }: { data: Omit<MockTokenRow, 'id' | 'createdAt' | 'revokedAt'> }) => {
        const row: MockTokenRow = {
          id: 'rt-' + (tokens.length + 1),
          createdAt: new Date(),
          revokedAt: null,
          ...data,
        };
        tokens.push(row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(tokens.find((r) => r.tokenHash === where.tokenHash) ?? null),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<MockTokenRow> }) => {
        const row = tokens.find((r) => r.id === where.id);
        if (!row) return Promise.reject(new Error('not found'));
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(({ where, data }: { where: Partial<MockTokenRow>; data: Partial<MockTokenRow> }) => {
        let count = 0;
        for (const r of tokens) {
          const matchesFamily = where.family === undefined || r.family === where.family;
          const matchesHash = where.tokenHash === undefined || r.tokenHash === where.tokenHash;
          const matchesRevoked =
            where.revokedAt === undefined ||
            (where.revokedAt === null && r.revokedAt === null);
          if (matchesFamily && matchesHash && matchesRevoked) {
            Object.assign(r, data);
            count++;
          }
        }
        return Promise.resolve({ count });
      }),
    },
  };
}

function makeMockJwt(refreshSecret = REFRESH_SECRET) {
  let counter = 0;
  return {
    sign: jest.fn((_payload: object, opts?: { secret?: string; expiresIn?: string }) => {
      counter++;
      // Use the secret in the token text so different secrets produce different
      // tokens — keeps signature deterministic per call without real JWT crypto.
      const tag = opts?.secret === refreshSecret ? 'refresh' : 'access';
      return `mock-${tag}-${counter}-${Math.random().toString(36).slice(2, 10)}`;
    }),
    verify: jest.fn(() => ({ sub: 'user-1', email: 'u@x.io', role: 'TECHNICIAN' })),
  };
}

function makeMockConfig() {
  const resolve = (key: string, fallback?: string) =>
    key === 'JWT_REFRESH_SECRET' ? REFRESH_SECRET : (fallback ?? '');
  return {
    get: jest.fn(resolve),
    // B25 — secrets are read via getOrThrow now (no hardcoded fallback).
    getOrThrow: jest.fn((key: string) => resolve(key)),
  };
}

async function buildService(prisma: any, jwt = makeMockJwt(), config = makeMockConfig()) {
  return new AuthService(prisma as any, jwt as any, config as any);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

async function makeUser(opts: Partial<{ id: string; email: string; password: string; isActive: boolean }> = {}) {
  return {
    id: opts.id ?? 'user-1',
    email: opts.email ?? 'u@x.io',
    password: await bcrypt.hash(opts.password ?? 'pw-secret', 4), // low rounds for speed
    role: 'TECHNICIAN',
    isActive: opts.isActive ?? true,
    firstName: 'U',
    lastName: 'Ser',
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────

describe('AuthService.login', () => {
  it('returns tokens and creates a fresh refresh-token row under a new family', async () => {
    const user = await makeUser({ password: 'correct-pw' });
    const prisma = makeMockPrisma({ user });
    const svc = await buildService(prisma);

    const raw = await svc.login({ email: user.email, password: 'correct-pw' } as LoginDto, 'test-tenant');
    // Login without 2FA returns the token pair directly. The type is a
    // union — narrow it here so the assertions type-check.
    if ('requires2fa' in raw) throw new Error('Unexpected 2FA branch in test');
    const result = raw;

    expect(result.accessToken).toMatch(/^mock-access-/);
    expect(result.refreshToken).toMatch(/^mock-refresh-/);
    expect((result as any).user.password).toBeUndefined();

    expect(prisma._tokens).toHaveLength(1);
    expect(prisma._tokens[0]).toMatchObject({
      tokenHash: hashToken(result.refreshToken),
      userId: user.id,
      revokedAt: null,
    });
    expect(prisma._tokens[0].family).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('throws UnauthorizedException on unknown email', async () => {
    const prisma = makeMockPrisma({ user: null });
    const svc = await buildService(prisma);
    await expect(
      svc.login({ email: 'nobody@x.io', password: 'x' } as LoginDto, 'test-tenant'),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma._tokens).toHaveLength(0);
  });

  it('throws UnauthorizedException on wrong password', async () => {
    const user = await makeUser({ password: 'correct-pw' });
    const prisma = makeMockPrisma({ user });
    const svc = await buildService(prisma);
    await expect(
      svc.login({ email: user.email, password: 'wrong-pw' } as LoginDto, 'test-tenant'),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma._tokens).toHaveLength(0);
  });

  it('throws UnauthorizedException when the user is disabled', async () => {
    const user = await makeUser({ password: 'correct-pw', isActive: false });
    const prisma = makeMockPrisma({ user });
    const svc = await buildService(prisma);
    await expect(
      svc.login({ email: user.email, password: 'correct-pw' } as LoginDto, 'test-tenant'),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma._tokens).toHaveLength(0);
  });
});

// ─── Refresh / rotation ──────────────────────────────────────────────────────

describe('AuthService.refresh', () => {
  it('rotates: revokes the old row, issues a new one in the same family', async () => {
    const user = await makeUser();
    const initialFamily = crypto.randomUUID();
    const tok1 = 'tok1';
    const prisma = makeMockPrisma({
      user,
      initialTokens: [
        {
          id: 'rt-seed',
          tokenHash: hashToken(tok1),
          userId: user.id,
          family: initialFamily,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        },
      ],
    });
    const svc = await buildService(prisma);

    const result = await svc.refresh(tok1);

    expect(result.refreshToken).toMatch(/^mock-refresh-/);
    expect(result.refreshToken).not.toBe(tok1);

    // Old row revoked
    const old = prisma._tokens.find((r) => r.tokenHash === hashToken(tok1));
    expect(old?.revokedAt).toBeInstanceOf(Date);

    // New row, same family, not revoked
    const fresh = prisma._tokens.find((r) => r.tokenHash === hashToken(result.refreshToken));
    expect(fresh?.family).toBe(initialFamily);
    expect(fresh?.revokedAt).toBeNull();
  });

  it('detects replay: replaying a revoked token kills the entire family', async () => {
    const user = await makeUser();
    const family = crypto.randomUUID();
    const tokRevoked = 'tok-revoked';
    const tokActive = 'tok-active';

    const prisma = makeMockPrisma({
      user,
      initialTokens: [
        {
          id: 'rt-old',
          tokenHash: hashToken(tokRevoked),
          userId: user.id,
          family,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(Date.now() - 1000),
        },
        {
          id: 'rt-new',
          tokenHash: hashToken(tokActive),
          userId: user.id,
          family,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        },
      ],
    });
    const svc = await buildService(prisma);

    await expect(svc.refresh(tokRevoked)).rejects.toThrow(UnauthorizedException);

    // Every token in the family is now revoked.
    for (const row of prisma._tokens) {
      expect(row.revokedAt).toBeInstanceOf(Date);
    }
  });

  it('rejects an expired refresh token', async () => {
    const user = await makeUser();
    const tok = 'tok-expired';
    const prisma = makeMockPrisma({
      user,
      initialTokens: [
        {
          id: 'rt-exp',
          tokenHash: hashToken(tok),
          userId: user.id,
          family: crypto.randomUUID(),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() - 1000),
          revokedAt: null,
        },
      ],
    });
    const svc = await buildService(prisma);
    await expect(svc.refresh(tok)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token whose user is disabled and marks the row revoked', async () => {
    const user = await makeUser({ isActive: false });
    const tok = 'tok-disabled';
    const prisma = makeMockPrisma({
      user,
      initialTokens: [
        {
          id: 'rt-d',
          tokenHash: hashToken(tok),
          userId: user.id,
          family: crypto.randomUUID(),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        },
      ],
    });
    const svc = await buildService(prisma);

    await expect(svc.refresh(tok)).rejects.toThrow(UnauthorizedException);
    expect(prisma._tokens[0].revokedAt).toBeInstanceOf(Date);
  });

  it('throws UnauthorizedException when no token is presented', async () => {
    const prisma = makeMockPrisma({ user: await makeUser() });
    const svc = await buildService(prisma);
    await expect(svc.refresh('')).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the JWT signature does not verify', async () => {
    const prisma = makeMockPrisma({ user: await makeUser() });
    const jwt = makeMockJwt();
    (jwt.verify as jest.Mock).mockImplementationOnce(() => {
      throw new Error('jwt malformed');
    });
    const svc = await buildService(prisma, jwt);
    await expect(svc.refresh('garbage')).rejects.toThrow(UnauthorizedException);
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────

describe('AuthService.logout', () => {
  it('revokes the presented token by hash', async () => {
    const user = await makeUser();
    const tok = 'tok-to-revoke';
    const prisma = makeMockPrisma({
      user,
      initialTokens: [
        {
          id: 'rt-l',
          tokenHash: hashToken(tok),
          userId: user.id,
          family: crypto.randomUUID(),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        },
      ],
    });
    const svc = await buildService(prisma);

    await svc.logout(tok);
    expect(prisma._tokens[0].revokedAt).toBeInstanceOf(Date);
  });

  it('is a no-op when no token is presented', async () => {
    const prisma = makeMockPrisma({ user: await makeUser() });
    const svc = await buildService(prisma);
    await expect(svc.logout('')).resolves.toBeUndefined();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
