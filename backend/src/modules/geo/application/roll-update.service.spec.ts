import { RollUpdateService, type RollUpdateRunner } from './roll-update.service';
import { GEO_ROLL_IMPORTED_EVENT } from '../../../common/contracts/geo-events.contract';

function makePrisma(opts: { loadedYear?: number | null; running?: boolean } = {}) {
  const jobs: Array<Record<string, unknown>> = [];
  return {
    jobs,
    propertyUnit: {
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 3816100 }, _max: { rollYear: opts.loadedYear ?? 2026 } }),
      count: jest.fn().mockResolvedValue(3900000),
    },
    municipality: { count: jest.fn().mockResolvedValue(1134) },
    geoImportJob: {
      findFirst: jest.fn().mockImplementation(({ where }: { where?: { status?: unknown } }) =>
        Promise.resolve(where?.status && opts.running ? { id: 'j-run', rollYear: 2027, status: 'RUNNING', startedAt: new Date(), finishedAt: null, rowsImported: null, error: null, log: '' } : null),
      ),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'j-1', startedAt: new Date(), finishedAt: null, rowsImported: null, error: null, log: '', ...data };
        jobs.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(jobs[0] ?? {}, data);
        return Promise.resolve(jobs[0]);
      }),
    },
  };
}

function makeRunner(over: Partial<RollUpdateRunner> = {}): RollUpdateRunner {
  return {
    headOk: jest.fn().mockResolvedValue(true),
    download: jest.fn().mockResolvedValue(undefined),
    unzip: jest.fn().mockResolvedValue(undefined),
    runImport: jest.fn().mockImplementation(async (_args: string[], onOutput: (l: string) => void) => {
      onOutput('adresses : 3,900,000 extraites');
      return 0;
    }),
    ...over,
  };
}

/** Waits for the detached run() to reach a terminal status (real fs calls are involved). */
async function settled(jobs: Array<Record<string, unknown>>) {
  for (let i = 0; i < 100; i++) {
    if (jobs[0] && ['SUCCESS', 'FAILED'].includes(String(jobs[0].status))) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`job never settled: ${JSON.stringify(jobs[0])}`);
}

beforeAll(() => {
  process.env.DATABASE_URL = 'postgresql://taskmgr:x@localhost:5432/test';
  process.env.GEO_IMPORT_WORKDIR = require('node:os').tmpdir();
});

describe('RollUpdateService', () => {
  it('status reports the loaded year, row counts and the last job', async () => {
    const prisma = makePrisma({ loadedYear: 2026 });
    const service = new RollUpdateService(prisma as never, { emit: jest.fn() } as never);
    const s = await service.status();
    expect(s).toMatchObject({ loadedRollYear: 2026, rows: 3816100, municipalities: 1134, running: null });
  });

  it('availableYears probes the MAMH from the loaded year to next year', async () => {
    const prisma = makePrisma({ loadedYear: 2026 });
    const service = new RollUpdateService(prisma as never, { emit: jest.fn() } as never);
    const runner = makeRunner({ headOk: jest.fn().mockImplementation((url: string) => Promise.resolve(url.includes('2027'))) });
    service.useRunner(runner);
    const thisYear = new Date().getFullYear();
    const years = await service.availableYears();
    expect(years[0]).toMatchObject({ year: 2026, loaded: true });
    expect(years.map((y) => y.year)).toContain(thisYear + 1);
    expect(years.find((y) => y.year === 2027)?.available).toBe(true);
  });

  it('start refuses a second concurrent import', async () => {
    const prisma = makePrisma({ running: true });
    const service = new RollUpdateService(prisma as never, { emit: jest.fn() } as never);
    await expect(service.start(2027, 'sa-1')).rejects.toThrow(/déjà en cours/);
  });

  it('runs download → unzip → import, marks SUCCESS and emits geo.roll.imported', async () => {
    const prisma = makePrisma();
    const emitter = { emit: jest.fn() };
    const service = new RollUpdateService(prisma as never, emitter as never);
    const runner = makeRunner();
    service.useRunner(runner);

    const job = await service.start(2027, 'sa-1');
    expect(['PENDING', 'RUNNING']).toContain(job.status);
    await settled(prisma.jobs);

    expect(runner.download).toHaveBeenCalledTimes(2);
    expect((runner.download as jest.Mock).mock.calls[0][0]).toContain('ROLE2027_GEOPACKAGE.zip');
    expect(runner.unzip).toHaveBeenCalled();
    const importArgs = (runner.runImport as jest.Mock).mock.calls[0][0] as string[];
    expect(importArgs.join(' ')).toMatch(/import-role\.py .*--year 2027 .*--psql psql/);
    expect(prisma.jobs[0]).toMatchObject({ status: 'SUCCESS', rowsImported: 3900000 });
    expect(prisma.jobs[0].log).toContain('3,900,000');
    expect(emitter.emit).toHaveBeenCalledWith(
      GEO_ROLL_IMPORTED_EVENT,
      expect.objectContaining({ rollYear: 2027, rowsImported: 3900000, actorUserId: 'sa-1' }),
    );
  });

  it('marks FAILED with the error when the script exits non-zero, and never emits', async () => {
    const prisma = makePrisma();
    const emitter = { emit: jest.fn() };
    const service = new RollUpdateService(prisma as never, emitter as never);
    service.useRunner(makeRunner({ runImport: jest.fn().mockResolvedValue(1) }));

    await service.start(2027, null);
    await settled(prisma.jobs);

    expect(prisma.jobs[0]).toMatchObject({ status: 'FAILED' });
    expect(String(prisma.jobs[0].error)).toMatch(/code 1/);
    expect(emitter.emit).not.toHaveBeenCalled();
  });
});
