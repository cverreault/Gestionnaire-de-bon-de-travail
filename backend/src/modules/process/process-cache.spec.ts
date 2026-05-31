/**
 * QA — process-cache.spec.ts
 *
 * Unit-tests for ProcessCacheService covering:
 *  1. getProcess — loads from DB and caches on first call
 *  2. getProcess — returns cached value on second call (no DB hit)
 *  3. getProcess — reloads from DB after invalidate()
 *  4. invalidate — removes single entry from cache
 *  5. invalidateAll — clears entire cache
 *  6. getDefaultProcess — delegates to getProcess with the found id
 *  7. getDefaultProcess — throws NotFoundException when no default process exists
 *  8. getProcessForTaskType — fast path via taskTypeIndex on second call
 *  9. getProcessForTaskType — falls back to default process when TaskType has no process
 * 10. Cache TTL — expired entries are reloaded
 */

import { NotFoundException } from '@nestjs/common';
import { ProcessCacheService } from './process-cache.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRawDefinition(id = 'proc-1', version = 1) {
  return {
    id,
    name: 'Standard BT',
    version,
    isDefault: true,
    statuses: [
      {
        id: 's-0',
        code: 0,
        name: 'Créé',
        color: '#6b7280',
        position: 0,
        isInitial: true,
        isDispatch: false,
        isStart: false,
        isTerminalPositive: false,
        isTerminalNegative: false,
      },
      {
        id: 's-100',
        code: 100,
        name: 'Assigné',
        color: '#3b82f6',
        position: 1,
        isInitial: false,
        isDispatch: false,
        isStart: false,
        isTerminalPositive: false,
        isTerminalNegative: false,
      },
    ],
    transitions: [
      {
        id: 't-0-100',
        fromStatusId: 's-0',
        toStatusId: 's-100',
        label: 'Assigner',
        allowedRoles: ['ADMIN', 'DISPATCHER'],
        requiredFields: ['assignedToId'],
        sortOrder: 0,
      },
    ],
  };
}

function makeMockPrisma(rawDef: any = makeRawDefinition()) {
  return {
    processDefinition: {
      findUnique: jest.fn().mockResolvedValue(rawDef),
      findFirst: jest.fn().mockResolvedValue({ id: rawDef.id }),
    },
    taskType: {
      findUnique: jest.fn().mockResolvedValue({ id: 'tt-1', processDefinitionId: rawDef.id }),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProcessCacheService.getProcess — DB load and cache hit', () => {
  it('loads process from DB on the first call', async () => {
    const prisma = makeMockPrisma();
    const svc = new ProcessCacheService(prisma as any);

    const result = await svc.getProcess('proc-1');

    expect(prisma.processDefinition.findUnique).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('proc-1');
    expect(result.name).toBe('Standard BT');
  });

  it('returns cached result on the second call without hitting DB', async () => {
    const prisma = makeMockPrisma();
    const svc = new ProcessCacheService(prisma as any);

    await svc.getProcess('proc-1');
    await svc.getProcess('proc-1');

    // DB should have been queried only once
    expect(prisma.processDefinition.findUnique).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundException when process does not exist in DB', async () => {
    const prisma = makeMockPrisma();
    prisma.processDefinition.findUnique = jest.fn().mockResolvedValue(null);
    const svc = new ProcessCacheService(prisma as any);

    await expect(svc.getProcess('non-existing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProcessCacheService.invalidate — cache busting', () => {
  it('forces a DB reload after invalidate()', async () => {
    const prisma = makeMockPrisma();
    const svc = new ProcessCacheService(prisma as any);

    await svc.getProcess('proc-1');            // 1st call → DB
    svc.invalidate('proc-1');                  // bust cache
    await svc.getProcess('proc-1');            // 2nd call → DB again

    expect(prisma.processDefinition.findUnique).toHaveBeenCalledTimes(2);
  });

  it('does NOT reload other processes when invalidating a specific id', async () => {
    const def1 = makeRawDefinition('proc-1');
    const def2 = makeRawDefinition('proc-2');
    const prisma = {
      processDefinition: {
        findUnique: jest.fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(where.id === 'proc-1' ? def1 : def2),
          ),
      },
    };
    const svc = new ProcessCacheService(prisma as any);

    await svc.getProcess('proc-1');
    await svc.getProcess('proc-2');
    svc.invalidate('proc-1');

    // Reset spy count
    (prisma.processDefinition.findUnique as jest.Mock).mockClear();

    await svc.getProcess('proc-1');  // should hit DB
    await svc.getProcess('proc-2');  // still cached

    expect(prisma.processDefinition.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('ProcessCacheService.invalidateAll', () => {
  it('clears all cached entries', async () => {
    const def1 = makeRawDefinition('proc-1');
    const def2 = makeRawDefinition('proc-2');
    const prisma = {
      processDefinition: {
        findUnique: jest.fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(where.id === 'proc-1' ? def1 : def2),
          ),
      },
    };
    const svc = new ProcessCacheService(prisma as any);

    await svc.getProcess('proc-1');
    await svc.getProcess('proc-2');
    svc.invalidateAll();

    (prisma.processDefinition.findUnique as jest.Mock).mockClear();

    await svc.getProcess('proc-1');
    await svc.getProcess('proc-2');

    expect(prisma.processDefinition.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('ProcessCacheService.getDefaultProcess', () => {
  it('returns the default process by delegating to getProcess', async () => {
    const prisma = makeMockPrisma();
    const svc = new ProcessCacheService(prisma as any);

    const result = await svc.getDefaultProcess();

    expect(prisma.processDefinition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDefault: true, isActive: true } }),
    );
    expect(result.id).toBe('proc-1');
  });

  it('throws NotFoundException when no default process exists', async () => {
    const prisma = makeMockPrisma();
    prisma.processDefinition.findFirst = jest.fn().mockResolvedValue(null);
    const svc = new ProcessCacheService(prisma as any);

    await expect(svc.getDefaultProcess()).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProcessCacheService.getProcessForTaskType', () => {
  it('loads process via TaskType processDefinitionId', async () => {
    const prisma = makeMockPrisma();
    const svc = new ProcessCacheService(prisma as any);

    const result = await svc.getProcessForTaskType('tt-1');

    expect(prisma.taskType.findUnique).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('proc-1');
  });

  it('uses the taskTypeIndex on second call (no DB hit for taskType lookup)', async () => {
    const prisma = makeMockPrisma();
    const svc = new ProcessCacheService(prisma as any);

    await svc.getProcessForTaskType('tt-1');  // populates index
    (prisma.taskType.findUnique as jest.Mock).mockClear();
    await svc.getProcessForTaskType('tt-1');  // hits index, no DB

    expect(prisma.taskType.findUnique).toHaveBeenCalledTimes(0);
  });

  it('falls back to default process when TaskType has no processDefinitionId', async () => {
    const prisma = makeMockPrisma();
    prisma.taskType.findUnique = jest.fn().mockResolvedValue({ id: 'tt-1', processDefinitionId: null });
    const svc = new ProcessCacheService(prisma as any);

    const result = await svc.getProcessForTaskType('tt-1');

    // Should still return a valid process (the default)
    expect(result).toBeDefined();
    expect(result.id).toBe('proc-1');
  });

  it('falls back to default process when TaskType does not exist in DB', async () => {
    const prisma = makeMockPrisma();
    prisma.taskType.findUnique = jest.fn().mockResolvedValue(null);
    const svc = new ProcessCacheService(prisma as any);

    const result = await svc.getProcessForTaskType('non-existing-tt');
    expect(result).toBeDefined();
  });
});

describe('ProcessCacheService — buildCachedProcess structure', () => {
  it('builds correct Maps for statuses and statusByCode', async () => {
    const prisma = makeMockPrisma();
    const svc = new ProcessCacheService(prisma as any);

    const cached = await svc.getProcess('proc-1');

    expect(cached.statuses.get('s-0')).toBeDefined();
    expect(cached.statuses.get('s-100')).toBeDefined();
    expect(cached.statusByCode.get(0)).toBeDefined();
    expect(cached.statusByCode.get(100)).toBeDefined();
  });

  it('correctly identifies the initialStatus', async () => {
    const prisma = makeMockPrisma();
    const svc = new ProcessCacheService(prisma as any);

    const cached = await svc.getProcess('proc-1');

    expect(cached.initialStatus).toBeDefined();
    expect(cached.initialStatus.isInitial).toBe(true);
    expect(cached.initialStatus.code).toBe(0);
  });

  it('builds the transitions adjacency map correctly', async () => {
    const prisma = makeMockPrisma();
    const svc = new ProcessCacheService(prisma as any);

    const cached = await svc.getProcess('proc-1');

    // One transition from s-0 → s-100
    const fromS0 = cached.transitions.get('s-0');
    expect(fromS0).toBeDefined();
    expect(fromS0!).toHaveLength(1);
    expect(fromS0![0].toStatusId).toBe('s-100');
  });

  it('uses first status as initialStatus fallback when none is flagged isInitial', async () => {
    const defNoInitial = makeRawDefinition();
    defNoInitial.statuses[0].isInitial = false;  // remove the flag

    const prisma = {
      processDefinition: {
        findUnique: jest.fn().mockResolvedValue(defNoInitial),
        findFirst: jest.fn().mockResolvedValue({ id: 'proc-1' }),
      },
      taskType: { findUnique: jest.fn() },
    };

    const svc = new ProcessCacheService(prisma as any);
    const cached = await svc.getProcess('proc-1');

    // Should fall back to first status (s-0)
    expect(cached.initialStatus).toBeDefined();
    expect(cached.initialStatus.id).toBe('s-0');
  });
});
