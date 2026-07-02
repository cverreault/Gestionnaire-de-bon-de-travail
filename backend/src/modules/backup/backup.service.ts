import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { Readable, PassThrough } from 'stream';
import { createGzip, createGunzip } from 'zlib';
import * as tar from 'tar';
import {
  mkdtempSync,
  rmSync,
  createReadStream,
  createWriteStream,
  statSync,
  existsSync,
  readdirSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { extract as tarExtract, pack as tarPack } from 'tar-stream';
import { MinioService } from '../../common/storage/minio.service';

export interface BackupManifest {
  version: string;
  createdAt: string;
  schemaName: string;
  minioObjectCount: number;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly minio: MinioService,
  ) {}

  getCurrentVersion(): string {
    return process.env['npm_package_version'] ?? '1.0.0';
  }

  buildFilename(version: string = this.getCurrentVersion()): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `taskmgr-backup_v${version}_${ts}.tar.gz`;
  }

  /**
   * Construit l'archive tar.gz en streaming.
   * L'ordre d'écriture est important : manifest.json EN PREMIER pour
   * permettre au restore de lire la version sans extraire toute l'archive.
   */
  async createArchiveStream(): Promise<Readable> {
    const version = this.getCurrentVersion();
    const minioKeys = await this.minio.listObjectKeys();

    const manifest: BackupManifest = {
      version,
      createdAt: new Date().toISOString(),
      schemaName: 'public',
      minioObjectCount: minioKeys.length,
    };

    const pack = tarPack();
    const gzipped = pack.pipe(createGzip());

    // Construction asynchrone : on retourne le stream gzippé tout de suite,
    // et on remplit le pack en arrière-plan.
    (async () => {
      try {
        // 1. Manifest (premier — le restore le lit en streaming)
        const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2));
        await new Promise<void>((resolve, reject) => {
          const entry = pack.entry(
            { name: 'manifest.json', size: manifestBuf.length },
            (err) => (err ? reject(err) : resolve()),
          );
          entry.end(manifestBuf);
        });

        // 2. pg_dump → database.sql
        await this.dumpDatabaseToPack(pack);

        // 3. MinIO objects
        for (const key of minioKeys) {
          await this.streamMinioObjectToPack(pack, key);
        }

        pack.finalize();
      } catch (err) {
        this.logger.error('Échec de la construction de l\'archive', err as Error);
        pack.destroy(err as Error);
      }
    })();

    return gzipped;
  }

  private async dumpDatabaseToPack(pack: ReturnType<typeof tarPack>): Promise<void> {
    // pg_dump écrit sur stdout. On ne connaît pas la taille à l'avance,
    // donc on bufferise dans un fichier temp puis on le streame dans le tar.
    const dbUrl = this.config.getOrThrow<string>('DATABASE_URL');
    const tempDir = mkdtempSync(join(tmpdir(), 'taskmgr-backup-'));
    const sqlPath = join(tempDir, 'database.sql');

    try {
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(sqlPath);
        const proc = spawn('pg_dump', [
          '--no-owner',
          '--no-privileges',
          '--clean',
          '--if-exists',
          dbUrl,
        ]);
        let stderr = '';
        proc.stderr.on('data', (d) => (stderr += d.toString()));
        proc.stdout.pipe(out);
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code !== 0) reject(new Error(`pg_dump exit ${code}: ${stderr}`));
          else resolve();
        });
      });

      const size = statSync(sqlPath).size;

      await new Promise<void>((resolve, reject) => {
        const entry = pack.entry({ name: 'database.sql', size }, (err) =>
          err ? reject(err) : resolve(),
        );
        const rs = createReadStream(sqlPath);
        rs.on('error', reject);
        rs.pipe(entry);
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private async streamMinioObjectToPack(
    pack: ReturnType<typeof tarPack>,
    key: string,
  ): Promise<void> {
    // Idem : taille inconnue avant lecture → on bufferise dans /tmp.
    const tempDir = mkdtempSync(join(tmpdir(), 'taskmgr-mio-'));
    const tempPath = join(tempDir, 'obj');
    try {
      const stream = await this.minio.getObjectStream(key);
      await new Promise<void>((resolve, reject) => {
        const ws = createWriteStream(tempPath);
        stream.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
        stream.on('error', reject);
      });

      const size = statSync(tempPath).size;

      await new Promise<void>((resolve, reject) => {
        const entry = pack.entry({ name: `minio/${key}`, size }, (err) =>
          err ? reject(err) : resolve(),
        );
        const rs = createReadStream(tempPath);
        rs.on('error', reject);
        rs.pipe(entry);
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Restaure une archive uploadée. Lit d'abord le manifest pour valider
   * la version, puis applique le SQL et restaure les objets MinIO.
   */
  async restore(uploadedFilePath: string): Promise<{
    backupVersion: string;
    attachmentsRestored: number;
  }> {
    // ── 1. Pré-extraction : lire manifest.json sans tout extraire ─────────
    const manifest = await this.readManifest(uploadedFilePath);
    const currentVersion = this.getCurrentVersion();

    if (manifest.version !== currentVersion) {
      throw new BadRequestException(
        `Version incompatible : backup=${manifest.version}, courant=${currentVersion}. Restore refusé.`,
      );
    }

    // ── 2. Extraire toute l'archive dans un dossier temporaire ────────────
    const tempDir = mkdtempSync(join(tmpdir(), 'taskmgr-restore-'));
    try {
      await tar.extract({ file: uploadedFilePath, cwd: tempDir });

      // ── 3. Restaurer la BD via psql ─────────────────────────────────────
      const sqlPath = join(tempDir, 'database.sql');
      await this.restoreDatabase(sqlPath);

      // ── 4. Restaurer MinIO : vider puis re-uploader ─────────────────────
      await this.minio.clearBucket();
      const restoredCount = await this.restoreMinio(join(tempDir, 'minio'));

      return {
        backupVersion: manifest.version,
        attachmentsRestored: restoredCount,
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private async readManifest(filePath: string): Promise<BackupManifest> {
    return new Promise((resolve, reject) => {
      const extract = tarExtract();
      let resolved = false;

      extract.on('entry', (header, stream, next) => {
        if (header.name === 'manifest.json') {
          const chunks: Buffer[] = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('end', () => {
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
              if (!parsed.version) {
                reject(new BadRequestException('Manifest invalide : version manquante'));
                return;
              }
              resolved = true;
              resolve(parsed as BackupManifest);
              extract.destroy();
            } catch (e) {
              reject(new BadRequestException('Manifest illisible (JSON invalide)'));
            }
            next();
          });
          stream.resume();
        } else {
          stream.on('end', next);
          stream.resume();
        }
      });

      extract.on('finish', () => {
        if (!resolved) {
          reject(new BadRequestException('Archive invalide : manifest.json introuvable'));
        }
      });
      extract.on('error', (err) => {
        if (!resolved) reject(err);
      });

      createReadStream(filePath).pipe(createGunzip()).pipe(extract);
    });
  }

  private async restoreDatabase(sqlPath: string): Promise<void> {
    const dbUrl = this.config.getOrThrow<string>('DATABASE_URL');
    return new Promise((resolve, reject) => {
      const proc = spawn('psql', [
        '--single-transaction',
        '--quiet',
        '-v',
        'ON_ERROR_STOP=1',
        dbUrl,
      ]);
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      const rs = createReadStream(sqlPath);
      rs.pipe(proc.stdin);
      rs.on('error', reject);
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new InternalServerErrorException(`psql exit ${code}: ${stderr}`));
        } else {
          resolve();
        }
      });
    });
  }

  private async restoreMinio(minioDir: string): Promise<number> {
    if (!existsSync(minioDir)) return 0;

    const walk = (dir: string, prefix: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const rel = prefix ? `${prefix}/${name}` : name;
        if (statSync(full).isDirectory()) out.push(...walk(full, rel));
        else out.push(rel);
      }
      return out;
    };

    const keys = walk(minioDir, '');
    for (const key of keys) {
      const full = join(minioDir, key);
      const stream = createReadStream(full);
      const mime = this.guessMime(key);
      // L'API minio attend un Readable
      const pass = new PassThrough();
      stream.pipe(pass);
      await this.minio.uploadStream(key, pass, mime);
    }
    return keys.length;
  }

  private guessMime(key: string): string {
    const lower = key.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }
}
