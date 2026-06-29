/**
 * QA — location-retention.service.spec.ts (B5.5)
 *
 * Locks the 7-day retention contract:
 *   1. The cutoff timestamp passed to Prisma is exactly now - 7 days
 *   2. Returns the number of rows deleted (so the cron caller can
 *      assert / log)
 *   3. No-op when no rows match — does not throw
 */

import { LocationRetentionService } from './location-retention.service';

function makePrisma() {
  return {
    technicianLocation: { deleteMany: jest.fn() },
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

function makeService(prisma: MockPrisma): LocationRetentionService {
  return new LocationRetentionService(prisma as unknown as never);
}

describe('LocationRetentionService.runOnce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-29T03:15:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes a cutoff exactly 7 days before now', async () => {
    const prisma = makePrisma();
    prisma.technicianLocation.deleteMany.mockResolvedValueOnce({ count: 0 });

    await makeService(prisma).runOnce();

    expect(prisma.technicianLocation.deleteMany).toHaveBeenCalledTimes(1);
    const args = prisma.technicianLocation.deleteMany.mock.calls[0][0];
    const cutoff = args.where.recordedAt.lt as Date;
    expect(cutoff.toISOString()).toBe('2026-06-22T03:15:00.000Z');
  });

  it('returns the number of rows deleted', async () => {
    const prisma = makePrisma();
    prisma.technicianLocation.deleteMany.mockResolvedValueOnce({ count: 42 });
    const n = await makeService(prisma).runOnce();
    expect(n).toBe(42);
  });

  it('no-ops when no rows match (returns 0)', async () => {
    const prisma = makePrisma();
    prisma.technicianLocation.deleteMany.mockResolvedValueOnce({ count: 0 });
    const n = await makeService(prisma).runOnce();
    expect(n).toBe(0);
  });
});
