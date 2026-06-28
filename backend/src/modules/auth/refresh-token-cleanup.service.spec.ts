/**
 * QA — refresh-token-cleanup.service.spec.ts
 *
 * Locks the nightly purge contract:
 *   - sweeps every row revoked OR expired more than 30 days ago
 *   - leaves recent revoked/expired rows alone (replay-protection window)
 *   - never throws — a failed sweep is logged, not crashed
 */

import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';

interface MockTokenRow {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

const DAY = 24 * 60 * 60 * 1000;

function makeMockPrisma(rows: MockTokenRow[]) {
  return {
    _rows: rows,
    refreshToken: {
      deleteMany: jest.fn(({ where }: { where: { OR: Array<{ revokedAt?: { lt: Date }; expiresAt?: { lt: Date } }> } }) => {
        const cutoff = (where.OR[0].revokedAt?.lt ?? where.OR[1].expiresAt?.lt) as Date;
        const keep = rows.filter((r) => {
          const revokedOld = r.revokedAt && r.revokedAt.getTime() < cutoff.getTime();
          const expiredOld = r.expiresAt.getTime() < cutoff.getTime();
          return !(revokedOld || expiredOld);
        });
        const removed = rows.length - keep.length;
        rows.length = 0;
        rows.push(...keep);
        return Promise.resolve({ count: removed });
      }),
    },
  };
}

function buildSvc(prisma: any) {
  return new RefreshTokenCleanupService(prisma as any);
}

describe('RefreshTokenCleanupService.sweep', () => {
  const now = Date.now();

  it('purges revoked rows older than 30 days', async () => {
    const prisma = makeMockPrisma([
      { id: 'old',   expiresAt: new Date(now + DAY),    revokedAt: new Date(now - 40 * DAY) }, // → delete
      { id: 'fresh', expiresAt: new Date(now + DAY),    revokedAt: new Date(now - 10 * DAY) }, // keep
      { id: 'live',  expiresAt: new Date(now + DAY),    revokedAt: null },                     // keep
    ]);
    const svc = buildSvc(prisma);

    await svc.sweep();

    expect(prisma._rows.map((r: MockTokenRow) => r.id).sort()).toEqual(['fresh', 'live']);
  });

  it('purges expired rows older than 30 days regardless of revokedAt', async () => {
    const prisma = makeMockPrisma([
      { id: 'expired-old', expiresAt: new Date(now - 40 * DAY), revokedAt: null }, // → delete
      { id: 'expired-new', expiresAt: new Date(now - 5  * DAY), revokedAt: null }, // keep
    ]);
    const svc = buildSvc(prisma);

    await svc.sweep();

    expect(prisma._rows.map((r: MockTokenRow) => r.id)).toEqual(['expired-new']);
  });

  it('leaves an empty table alone (no rows = no work)', async () => {
    const prisma = makeMockPrisma([]);
    const svc = buildSvc(prisma);

    await expect(svc.sweep()).resolves.toBeUndefined();
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the underlying delete fails', async () => {
    const prisma = makeMockPrisma([]);
    (prisma.refreshToken.deleteMany as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const svc = buildSvc(prisma);

    await expect(svc.sweep()).resolves.toBeUndefined();
  });
});
