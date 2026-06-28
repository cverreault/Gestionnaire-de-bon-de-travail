/**
 * QA — audit-cleanup.service.spec.ts
 */

import { AuditCleanupService, AUDIT_CLEANUP_CONSTANTS } from './audit-cleanup.service';

const DAY = 24 * 60 * 60 * 1000;

interface MockAuditRow {
  id: string;
  occurredAt: Date;
}

function makeMockPrisma(rows: MockAuditRow[]) {
  return {
    _rows: rows,
    auditLog: {
      deleteMany: jest.fn(({ where }: { where: { occurredAt: { lt: Date } } }) => {
        const cutoff = where.occurredAt.lt;
        const keep = rows.filter((r) => r.occurredAt >= cutoff);
        const removed = rows.length - keep.length;
        rows.length = 0;
        rows.push(...keep);
        return Promise.resolve({ count: removed });
      }),
    },
  };
}

function makeConfig(envValue?: string) {
  return {
    get: jest.fn((key: string) => (key === 'AUDIT_RETENTION_DAYS' ? envValue : undefined)),
  };
}

describe('AuditCleanupService', () => {
  const now = Date.now();

  describe('sweep', () => {
    it('purges rows older than the configured retention window (default 365 days)', async () => {
      const prisma = makeMockPrisma([
        { id: 'old',    occurredAt: new Date(now - 400 * DAY) },
        { id: 'border', occurredAt: new Date(now - 360 * DAY) },
        { id: 'fresh',  occurredAt: new Date(now - 10  * DAY) },
      ]);
      const svc = new AuditCleanupService(prisma as any, makeConfig() as any);

      await svc.sweep();

      expect(prisma._rows.map((r: MockAuditRow) => r.id)).toEqual(['border', 'fresh']);
    });

    it('honours AUDIT_RETENTION_DAYS when set', async () => {
      const prisma = makeMockPrisma([
        { id: 'before-90', occurredAt: new Date(now - 95 * DAY) },
        { id: 'before-30', occurredAt: new Date(now - 35 * DAY) },
        { id: 'fresh',     occurredAt: new Date(now - 5  * DAY) },
      ]);
      const svc = new AuditCleanupService(prisma as any, makeConfig('60') as any);

      await svc.sweep();

      expect(prisma._rows.map((r: MockAuditRow) => r.id)).toEqual(['before-30', 'fresh']);
    });

    it('clamps configured retention to the [MIN, MAX] range', async () => {
      const svcTooSmall = new AuditCleanupService(
        makeMockPrisma([]) as any,
        makeConfig('1') as any,
      );
      expect((svcTooSmall as any).retentionDays).toBe(AUDIT_CLEANUP_CONSTANTS.MIN_RETENTION_DAYS);

      const svcTooLarge = new AuditCleanupService(
        makeMockPrisma([]) as any,
        makeConfig('999999') as any,
      );
      expect((svcTooLarge as any).retentionDays).toBe(AUDIT_CLEANUP_CONSTANTS.MAX_RETENTION_DAYS);
    });

    it('falls back to default when the env value is not numeric', async () => {
      const svc = new AuditCleanupService(makeMockPrisma([]) as any, makeConfig('twelve') as any);
      expect((svc as any).retentionDays).toBe(AUDIT_CLEANUP_CONSTANTS.DEFAULT_RETENTION_DAYS);
    });

    it('does not throw when the delete fails', async () => {
      const prisma = makeMockPrisma([]);
      (prisma.auditLog.deleteMany as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const svc = new AuditCleanupService(prisma as any, makeConfig() as any);

      await expect(svc.sweep()).resolves.toBeUndefined();
    });
  });
});
