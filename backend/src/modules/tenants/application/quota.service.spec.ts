/**
 * QA — quota.service.spec.ts (B6.6)
 *
 * Locks the atomic-check contract :
 *   1. checkAndConsume hits the right column pair for each QuotaType
 *   2. zero rows back from the UPDATE → ForbiddenException
 *   3. one or more rows back → success
 *   4. STORAGE_BYTES converts the MB ceiling to bytes
 *   5. release() decrements via GREATEST(0, …) so the counter never
 *      goes negative
 */

import { ForbiddenException } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { QuotaType } from '../../../common/contracts/quota.contract';

function makePrisma() {
  return {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

function makeService(prisma: MockPrisma): QuotaService {
  return new QuotaService(prisma as unknown as never);
}

describe('QuotaService.checkAndConsume', () => {
  it('succeeds and returns when the UPDATE affects one row', async () => {
    const prisma = makePrisma();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 't-1' }]);

    await expect(
      makeService(prisma).checkAndConsume(QuotaType.USERS, 't-1'),
    ).resolves.toBeUndefined();

    const [sql, amount, tenantId] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('current_users');
    expect(sql).toContain('max_users');
    expect(amount).toBe(1);
    expect(tenantId).toBe('t-1');
  });

  it('throws ForbiddenException when zero rows come back', async () => {
    const prisma = makePrisma();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(
      makeService(prisma).checkAndConsume(QuotaType.CLIENTS, 't-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('targets the right column pair for WORK_ORDERS_PER_MONTH', async () => {
    const prisma = makePrisma();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 't-1' }]);

    await makeService(prisma).checkAndConsume(
      QuotaType.WORK_ORDERS_PER_MONTH,
      't-1',
    );

    const [sql] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('current_work_orders_this_month');
    expect(sql).toContain('max_work_orders_per_month');
  });

  it('multiplies the MB ceiling to bytes for STORAGE_BYTES', async () => {
    const prisma = makePrisma();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 't-1' }]);

    await makeService(prisma).checkAndConsume(
      QuotaType.STORAGE_BYTES,
      't-1',
      4096,
    );

    const [sql] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/max_storage_mb"\s*\*\s*1024\s*\*\s*1024/);
  });

  it('honours a custom amount > 1', async () => {
    const prisma = makePrisma();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 't-1' }]);

    await makeService(prisma).checkAndConsume(QuotaType.USERS, 't-1', 5);

    expect(prisma.$queryRawUnsafe.mock.calls[0][1]).toBe(5);
  });
});

describe('QuotaService.release', () => {
  it('decrements via GREATEST(0, …)', async () => {
    const prisma = makePrisma();
    prisma.$executeRawUnsafe.mockResolvedValueOnce(1);

    await makeService(prisma).release(QuotaType.USERS, 't-1');

    const [sql, amount, tenantId] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(sql).toContain('GREATEST(0');
    expect(sql).toContain('current_users');
    expect(amount).toBe(1);
    expect(tenantId).toBe('t-1');
  });
});
