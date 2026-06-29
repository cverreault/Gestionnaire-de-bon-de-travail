/**
 * QA — kpi.service.spec.ts
 *
 * Direct instantiation, no @nestjs/testing — matches the rest of the
 * repo's spec convention. Prisma calls are mocked at the method level
 * so the algorithm logic (grouping, rate computation, default range)
 * is asserted without a real DB. Raw-SQL endpoints are smoke-tested
 * for shape only.
 */

import { WorkOrderStatus } from '@prisma/client';
import { KpiService } from './kpi.service';

function makePrisma() {
  return {
    workOrder: { groupBy: jest.fn() },
    taskType: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

function makeService(prisma: MockPrisma): KpiService {
  return new KpiService(prisma as unknown as never);
}

describe('KpiService', () => {
  describe('defaultRange', () => {
    it('returns the last 30 days ending now', () => {
      const range = makeService(makePrisma()).defaultRange();
      const diffMs = range.to.getTime() - range.from.getTime();
      const days = diffMs / (1000 * 60 * 60 * 24);
      expect(days).toBeGreaterThan(29);
      expect(days).toBeLessThan(31);
    });

    it('aligns `from` on midnight UTC', () => {
      const { from } = makeService(makePrisma()).defaultRange();
      expect(from.getUTCHours()).toBe(0);
      expect(from.getUTCMinutes()).toBe(0);
      expect(from.getUTCSeconds()).toBe(0);
    });
  });

  describe('parseRange', () => {
    it('falls back to defaults when both bounds are absent', () => {
      const svc = makeService(makePrisma());
      const def = svc.defaultRange();
      const parsed = svc.parseRange();
      expect(parsed.from.getTime()).toBeCloseTo(def.from.getTime(), -3);
    });

    it('parses ISO timestamps verbatim', () => {
      const parsed = makeService(makePrisma()).parseRange(
        '2026-01-01T00:00:00Z',
        '2026-01-31T23:59:59Z',
      );
      expect(parsed.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(parsed.to.toISOString()).toBe('2026-01-31T23:59:59.000Z');
    });
  });

  describe('completionOutcomeByTaskType', () => {
    it('computes per-type success rate and orders by volume desc', async () => {
      const prisma = makePrisma();
      prisma.workOrder.groupBy.mockResolvedValueOnce([
        { taskTypeId: 'A', status: WorkOrderStatus.COMPLETED_POSITIVE, _count: { _all: 8 } },
        { taskTypeId: 'A', status: WorkOrderStatus.COMPLETED_NEGATIVE, _count: { _all: 2 } },
        { taskTypeId: 'B', status: WorkOrderStatus.COMPLETED_POSITIVE, _count: { _all: 1 } },
        { taskTypeId: 'B', status: WorkOrderStatus.COMPLETED_NEGATIVE, _count: { _all: 4 } },
      ]);
      prisma.taskType.findMany.mockResolvedValueOnce([
        { id: 'A', name: 'Repair' },
        { id: 'B', name: 'Install' },
      ]);

      const rows = await makeService(prisma).completionOutcomeByTaskType({
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      });

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        taskTypeId: 'A',
        taskTypeName: 'Repair',
        positive: 8,
        negative: 2,
        successRate: 0.8,
      });
      expect(rows[1]).toEqual({
        taskTypeId: 'B',
        taskTypeName: 'Install',
        positive: 1,
        negative: 4,
        successRate: 0.2,
      });
    });

    it('returns no rows when no completions exist', async () => {
      const prisma = makePrisma();
      prisma.workOrder.groupBy.mockResolvedValueOnce([]);
      prisma.taskType.findMany.mockResolvedValueOnce([]);
      const rows = await makeService(prisma).completionOutcomeByTaskType({
        from: new Date(),
        to: new Date(),
      });
      expect(rows).toEqual([]);
    });

    it('handles BTs with no task type (groups under null)', async () => {
      const prisma = makePrisma();
      prisma.workOrder.groupBy.mockResolvedValueOnce([
        { taskTypeId: null, status: WorkOrderStatus.COMPLETED_POSITIVE, _count: { _all: 3 } },
      ]);
      prisma.taskType.findMany.mockResolvedValueOnce([]);
      const rows = await makeService(prisma).completionOutcomeByTaskType({
        from: new Date(),
        to: new Date(),
      });
      expect(rows).toEqual([
        {
          taskTypeId: null,
          taskTypeName: null,
          positive: 3,
          negative: 0,
          successRate: 1,
        },
      ]);
    });
  });

  describe('slaSummaryByTaskType', () => {
    it('computes breach rate per type', async () => {
      const prisma = makePrisma();
      prisma.workOrder.groupBy
        .mockResolvedValueOnce([
          { taskTypeId: 'A', _count: { _all: 10 } },
          { taskTypeId: 'B', _count: { _all: 5 } },
        ])
        .mockResolvedValueOnce([
          { taskTypeId: 'A', _count: { _all: 1 } },
          { taskTypeId: 'B', _count: { _all: 4 } },
        ]);
      prisma.taskType.findMany.mockResolvedValueOnce([
        { id: 'A', name: 'Repair' },
        { id: 'B', name: 'Install' },
      ]);

      const rows = await makeService(prisma).slaSummaryByTaskType({
        from: new Date(),
        to: new Date(),
      });

      expect(rows).toEqual([
        { taskTypeId: 'A', taskTypeName: 'Repair', tracked: 10, breached: 1, breachRate: 0.1 },
        { taskTypeId: 'B', taskTypeName: 'Install', tracked: 5, breached: 4, breachRate: 0.8 },
      ]);
    });

    it('returns empty list when no SLA-tracked BTs exist', async () => {
      const prisma = makePrisma();
      prisma.workOrder.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.taskType.findMany.mockResolvedValueOnce([]);
      const rows = await makeService(prisma).slaSummaryByTaskType({
        from: new Date(),
        to: new Date(),
      });
      expect(rows).toEqual([]);
    });
  });

  describe('resolutionTimeByTaskType', () => {
    it('passes through the raw-SQL result and converts bigints', async () => {
      const prisma = makePrisma();
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          task_type_id: 'A',
          task_type_name: 'Repair',
          completed_count: 12n,
          avg_hours: 4.5,
          median_hours: 3.25,
        },
      ]);
      const rows = await makeService(prisma).resolutionTimeByTaskType({
        from: new Date(),
        to: new Date(),
      });
      expect(rows[0]).toEqual({
        taskTypeId: 'A',
        taskTypeName: 'Repair',
        completedCount: 12,
        avgResolutionHours: 4.5,
        medianResolutionHours: 3.25,
      });
    });
  });

  describe('throughput', () => {
    it('returns ISO-date buckets with created + completed counts', async () => {
      const prisma = makePrisma();
      prisma.$queryRaw.mockResolvedValueOnce([
        { day: new Date('2026-01-01T00:00:00Z'), created: 5n, completed: 3n },
        { day: new Date('2026-01-02T00:00:00Z'), created: 7n, completed: 6n },
      ]);
      const buckets = await makeService(prisma).throughput({
        from: new Date('2026-01-01'),
        to: new Date('2026-01-02'),
      });
      expect(buckets).toEqual([
        { date: '2026-01-01', created: 5, completed: 3 },
        { date: '2026-01-02', created: 7, completed: 6 },
      ]);
    });
  });
});
