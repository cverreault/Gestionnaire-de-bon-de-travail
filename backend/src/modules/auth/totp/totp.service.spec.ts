import { UnauthorizedException } from '@nestjs/common';
import { TotpService } from './totp.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * B26 — brute-force lockout. We drive verify() with a non-numeric code so
 * it skips the TOTP-decode branch (no real secret needed) and no backup
 * hash, landing on the failure path — exercising the counter/lock logic.
 */
function makeHarness(overrides: Record<string, unknown> = {}) {
  interface UserRowLocal {
    id: string;
    email: string;
    totpSecret: string | null;
    totpEnabled: boolean;
    totpBackupCodesHash: string | null;
    totpFailedAttempts: number;
    totpLockedUntil: Date | null;
  }
  type UserRow = UserRowLocal;

  const user: UserRow = {
    id: 'u1',
    email: 'u@x.io',
    totpSecret: 'enc',
    totpEnabled: true,
    totpBackupCodesHash: null,
    totpFailedAttempts: 0,
    totpLockedUntil: null,
    ...overrides,
  };

  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({ ...user })),
      update: jest.fn(async (args: { data: Partial<UserRow> }) => {
        Object.assign(user, args.data);
        return { ...user };
      }),
    },
  } as unknown as PrismaService;

  const svc = new TotpService(prisma as unknown as never);
  return { svc, user, prisma };
}

describe('TotpService — 2FA lockout (B26)', () => {
  it('increments the failed-attempt counter on a wrong code', async () => {
    const h = makeHarness({ totpFailedAttempts: 0 });
    await expect(h.svc.verify('u1', 'wrongcode')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(h.user.totpFailedAttempts).toBe(1);
    expect(h.user.totpLockedUntil).toBeNull();
  });

  it('locks the account after the 5th failed attempt', async () => {
    const h = makeHarness({ totpFailedAttempts: 4 });
    await expect(h.svc.verify('u1', 'wrongcode')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // counter reset to 0, lock window set in the future
    expect(h.user.totpFailedAttempts).toBe(0);
    expect(h.user.totpLockedUntil).toBeInstanceOf(Date);
    expect(h.user.totpLockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses immediately while locked, without checking the code', async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    const h = makeHarness({ totpLockedUntil: future });
    await expect(h.svc.verify('u1', '123456')).rejects.toThrow(/Trop de tentatives/i);
    // no update issued — pure early return
    expect((h.prisma.user.update as jest.Mock)).not.toHaveBeenCalled();
  });

  it('lets a request through once the lock window has passed', async () => {
    const past = new Date(Date.now() - 60_000);
    const h = makeHarness({ totpLockedUntil: past, totpFailedAttempts: 0 });
    // still a wrong code → fails, but NOT the lock message
    await expect(h.svc.verify('u1', 'wrongcode')).rejects.toThrow(
      /invalide/i,
    );
  });
});
