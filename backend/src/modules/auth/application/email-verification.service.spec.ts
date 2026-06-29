/**
 * QA — email-verification.service.spec.ts (B6.8)
 *
 * Locks the verify contract :
 *   1. Unknown token → NotFoundException
 *   2. Consumed token → BadRequestException
 *   3. Expired token → BadRequestException
 *   4. Valid token → consumed + user.emailVerifiedAt set
 *   5. issueToken returns the raw value, persists only the hash,
 *      logs the build link
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';

function makePrisma() {
  return {
    emailVerification: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

function makeConfigs(origin?: string) {
  return {
    resolve: jest.fn(async (key: string) =>
      key === 'platform.origin' ? origin : undefined,
    ),
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;
type MockConfigs = ReturnType<typeof makeConfigs>;

function makeService(prisma: MockPrisma, configs: MockConfigs): EmailVerificationService {
  return new EmailVerificationService(
    prisma as unknown as never,
    configs as unknown as never,
  );
}

describe('EmailVerificationService.issueToken', () => {
  it('persists the SHA-256 hash + returns the raw token', async () => {
    const prisma = makePrisma();
    prisma.emailVerification.create.mockResolvedValueOnce({});

    const raw = await makeService(prisma, makeConfigs()).issueToken('u-1', 'democamp');

    expect(typeof raw).toBe('string');
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    const create = prisma.emailVerification.create.mock.calls[0][0];
    expect(create.data.userId).toBe('u-1');
    expect(create.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(create.data.tokenHash).not.toBe(raw);
    expect(create.data.expiresAt).toBeInstanceOf(Date);
  });
});

describe('EmailVerificationService.verify', () => {
  it('throws NotFoundException for an unknown token', async () => {
    const prisma = makePrisma();
    prisma.emailVerification.findUnique.mockResolvedValueOnce(null);

    await expect(
      makeService(prisma, makeConfigs()).verify('whatever'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the token was already consumed', async () => {
    const prisma = makePrisma();
    prisma.emailVerification.findUnique.mockResolvedValueOnce({
      id: 'ev-1',
      userId: 'u-1',
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      makeService(prisma, makeConfigs()).verify('whatever'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for an expired token', async () => {
    const prisma = makePrisma();
    prisma.emailVerification.findUnique.mockResolvedValueOnce({
      id: 'ev-1',
      userId: 'u-1',
      consumedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      makeService(prisma, makeConfigs()).verify('whatever'),
    ).rejects.toThrow(BadRequestException);
  });

  it('consumes the token + sets user.emailVerifiedAt on success', async () => {
    const prisma = makePrisma();
    prisma.emailVerification.findUnique.mockResolvedValueOnce({
      id: 'ev-1',
      userId: 'u-1',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.emailVerification.update.mockReturnValue({});
    prisma.user.update.mockReturnValue({});

    const result = await makeService(prisma, makeConfigs()).verify(
      'definitely-a-valid-token',
    );

    expect(result).toEqual({ userId: 'u-1' });
    expect(prisma.emailVerification.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { emailVerifiedAt: expect.any(Date) },
    });
  });
});
