import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  GEO_ROLL_IMPORTED_EVENT,
  type GeoRollImportedPayload,
} from '../../../common/contracts/geo-events.contract';

export const ROLL_BASE_URL = 'https://donneesouvertes.affmunqc.net/role';

export type RollJobStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface RollStatus {
  loadedRollYear: number | null;
  rows: number;
  municipalities: number;
  lastJob: RollJobView | null;
  running: RollJobView | null;
}

export interface RollJobView {
  id: string;
  rollYear: number;
  status: RollJobStatus;
  startedAt: Date;
  finishedAt: Date | null;
  rowsImported: number | null;
  error: string | null;
  log: string;
}

/** Hooks so the heavy I/O can be replaced in tests. */
export interface RollUpdateRunner {
  download(url: string, dest: string): Promise<void>;
  unzip(zip: string, dir: string): Promise<void>;
  runImport(args: string[], onOutput: (line: string) => void): Promise<number>;
  headOk(url: string): Promise<boolean>;
}

const LOG_LIMIT = 16_000;

/**
 * B40.3 — refresh of the assessment roll from the super-admin portal.
 *
 * `start()` records a job row and runs, detached from the request:
 * download the GeoPackage zip + municipality index from the MAMH, unzip
 * in a work dir, run `scripts/geo/import-role.py` (python3 + psql are in
 * the image; the script truncates/reloads each table in one transaction),
 * then emit `geo.roll.imported` so `clients` re-matches its addresses.
 * One job at a time; the log tail is persisted for the UI.
 */
@Injectable()
export class RollUpdateService {
  private readonly logger = new Logger(RollUpdateService.name);
  private runningJobId: string | null = null;
  private runner: RollUpdateRunner;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.runner = defaultRunner;
  }

  /** Test seam. */
  useRunner(runner: RollUpdateRunner): void {
    this.runner = runner;
  }

  async status(): Promise<RollStatus> {
    const [agg, municipalities, lastJob, running] = await Promise.all([
      this.prisma.propertyUnit.aggregate({ _count: { _all: true }, _max: { rollYear: true } }),
      this.prisma.municipality.count(),
      this.prisma.geoImportJob.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.geoImportJob.findFirst({ where: { status: { in: ['PENDING', 'RUNNING'] } }, orderBy: { startedAt: 'desc' } }),
    ]);
    return {
      loadedRollYear: agg._max.rollYear ?? null,
      rows: agg._count._all,
      municipalities,
      lastJob: lastJob ? toView(lastJob) : null,
      running: running ? toView(running) : null,
    };
  }

  /** Years for which the MAMH publishes a GeoPackage, from the loaded year up to next year. */
  async availableYears(): Promise<Array<{ year: number; available: boolean; loaded: boolean }>> {
    const { loadedRollYear } = await this.status();
    const thisYear = new Date().getFullYear();
    const from = Math.min(loadedRollYear ?? thisYear, thisYear);
    const years: number[] = [];
    for (let y = from; y <= thisYear + 1; y++) years.push(y);
    return Promise.all(
      years.map(async (year) => ({
        year,
        available: await this.runner.headOk(`${ROLL_BASE_URL}/ROLE${year}_GEOPACKAGE.zip`),
        loaded: year === loadedRollYear,
      })),
    );
  }

  async job(id: string): Promise<RollJobView | null> {
    const row = await this.prisma.geoImportJob.findUnique({ where: { id } });
    return row ? toView(row) : null;
  }

  async recentJobs(limit = 10): Promise<RollJobView[]> {
    const rows = await this.prisma.geoImportJob.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
    return rows.map(toView);
  }

  /** Creates the job and starts it in the background. Throws if one is already running. */
  async start(rollYear: number, triggeredById: string | null): Promise<RollJobView> {
    const running = await this.prisma.geoImportJob.findFirst({ where: { status: { in: ['PENDING', 'RUNNING'] } } });
    if (running || this.runningJobId) {
      throw new Error('Un import est déjà en cours');
    }
    const job = await this.prisma.geoImportJob.create({ data: { rollYear, triggeredById, status: 'PENDING' } });
    this.runningJobId = job.id;
    void this.run(job.id, rollYear, triggeredById).finally(() => {
      this.runningJobId = null;
    });
    return toView(job);
  }

  private async run(jobId: string, year: number, actorUserId: string | null): Promise<void> {
    const workDir = path.join(process.env.GEO_IMPORT_WORKDIR ?? '/tmp', `geo-role-${year}`);
    let log = '';
    const append = async (line: string) => {
      log = (log + line + '\n').slice(-LOG_LIMIT);
      await this.prisma.geoImportJob.update({ where: { id: jobId }, data: { log } }).catch(() => undefined);
    };
    try {
      await this.prisma.geoImportJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } });
      await rm(workDir, { recursive: true, force: true });
      await mkdir(workDir, { recursive: true });

      const zip = path.join(workDir, `ROLE${year}_GEOPACKAGE.zip`);
      const index = path.join(workDir, `indexRole${year}.csv`);
      await append(`Téléchargement ${ROLL_BASE_URL}/ROLE${year}_GEOPACKAGE.zip …`);
      await this.runner.download(`${ROLL_BASE_URL}/ROLE${year}_GEOPACKAGE.zip`, zip);
      await this.runner.download(`${ROLL_BASE_URL}/indexRole${year}.csv`, index);
      await append('Décompression…');
      await this.runner.unzip(zip, workDir);
      const gpkg = path.join(workDir, `Role${year}_geopackage`, `Role_${year}_2.gpkg`);

      const dsn = process.env.DATABASE_URL;
      if (!dsn) throw new Error('DATABASE_URL manquant');
      await append('Import (extraction + COPY)…');
      const script = path.resolve(process.cwd(), 'scripts/geo/import-role.py');
      const code = await this.runner.runImport(
        [script, '--gpkg', gpkg, '--index', index, '--year', String(year), '--dsn', dsn, '--psql', 'psql'],
        (line) => void append(line),
      );
      if (code !== 0) throw new Error(`import-role.py a terminé avec le code ${code}`);

      const rows = await this.prisma.propertyUnit.count({ where: { rollYear: year } });
      await this.prisma.geoImportJob.update({
        where: { id: jobId },
        data: { status: 'SUCCESS', finishedAt: new Date(), rowsImported: rows, log },
      });
      const payload: GeoRollImportedPayload = {
        eventName: GEO_ROLL_IMPORTED_EVENT,
        occurredAt: new Date(),
        aggregateId: jobId,
        actorUserId,
        rollYear: year,
        rowsImported: rows,
      };
      this.eventEmitter.emit(GEO_ROLL_IMPORTED_EVENT, payload);
      this.logger.log(`Roll ${year} imported: ${rows} rows`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Roll import ${year} failed: ${message}`);
      await this.prisma.geoImportJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', finishedAt: new Date(), error: message, log },
      }).catch(() => undefined);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function toView(row: {
  id: string; rollYear: number; status: string; startedAt: Date; finishedAt: Date | null;
  rowsImported: number | null; error: string | null; log: string;
}): RollJobView {
  return {
    id: row.id,
    rollYear: row.rollYear,
    status: row.status as RollJobStatus,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    rowsImported: row.rowsImported,
    error: row.error,
    log: row.log,
  };
}

const defaultRunner: RollUpdateRunner = {
  async headOk(url) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
      return res.ok;
    } catch {
      return false;
    }
  },
  async download(url, dest) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60 * 60_000) });
    if (!res.ok || !res.body) throw new Error(`Téléchargement échoué (${res.status}) : ${url}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
  },
  unzip(zip, dir) {
    return new Promise((resolve, reject) => {
      const p = spawn('unzip', ['-o', '-q', zip, '-d', dir]);
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`unzip code ${code}`))));
    });
  },
  runImport(args, onOutput) {
    return new Promise((resolve, reject) => {
      const p = spawn('python3', args, { env: process.env });
      const feed = (chunk: Buffer) =>
        chunk.toString('utf8').split('\n').filter((l) => l.trim()).forEach(onOutput);
      p.stdout.on('data', feed);
      p.stderr.on('data', feed);
      p.on('error', reject);
      p.on('close', (code) => resolve(code ?? 1));
    });
  },
};
