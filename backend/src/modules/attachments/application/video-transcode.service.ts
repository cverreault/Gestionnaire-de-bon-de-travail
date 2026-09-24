import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MinioService } from '../../../common/storage/minio.service';

/**
 * B64 — server-side video compression.
 *
 * Phones record 1080p/4K at 10–40 Mbit/s : a 2-minute clip weighs 30–100 MB.
 * After the upload succeeded, the original is re-encoded in the background
 * with ffmpeg (H.264, ≤ 1920 px wide, CRF 23, AAC 96 kb/s, faststart) — the
 * visual quality stays good for field footage and the file shrinks 5–10×.
 * The compressed copy replaces the object and the row only when it is really
 * smaller ; any failure leaves the original untouched. One job at a time.
 *
 * Env : ATTACHMENTS_VIDEO_TRANSCODE=0 disables ; ATTACHMENTS_VIDEO_MAX_WIDTH
 * (default 1920) ; ATTACHMENTS_VIDEO_CRF (default 23, lower = better).
 */
@Injectable()
export class VideoTranscodeService {
  private readonly logger = new Logger(VideoTranscodeService.name);
  private chain: Promise<void> = Promise.resolve();
  private ffmpegMissing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  get enabled(): boolean {
    return process.env.ATTACHMENTS_VIDEO_TRANSCODE !== '0' && !this.ffmpegMissing;
  }

  /** Fire-and-forget : queued behind the previous job, never throws to the caller. */
  queue(attachmentId: string): void {
    if (!this.enabled) return;
    this.chain = this.chain
      .then(() => this.transcode(attachmentId))
      .then(() => undefined)
      .catch((err) => this.logger.warn(`video transcode ${attachmentId} failed: ${err instanceof Error ? err.message : String(err)}`));
  }

  /** ffmpeg arguments for one file (exported for the spec). */
  static ffmpegArgs(input: string, output: string, opts: { maxWidth: number; crf: number }): string[] {
    return [
      '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-i', input,
      // keep aspect ratio, never upscale, even dimensions for H.264
      '-vf', `scale='min(${opts.maxWidth},iw)':-2`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(opts.crf), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
      '-movflags', '+faststart',
      output,
    ];
  }

  async transcode(attachmentId: string): Promise<'replaced' | 'kept' | 'skipped'> {
    const row = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, fileName: true, fileSize: true, mimeType: true, storageKey: true, workOrderId: true },
    });
    if (!row || !row.mimeType.startsWith('video/')) return 'skipped';

    const dir = await mkdtemp(path.join(tmpdir(), 'transcode-'));
    const input = path.join(dir, `in${path.extname(row.storageKey) || '.bin'}`);
    const output = path.join(dir, 'out.mp4');
    try {
      await pipeline(await this.minio.getObjectStream(row.storageKey), createWriteStream(input));
      const maxWidth = Number(process.env.ATTACHMENTS_VIDEO_MAX_WIDTH) || 1920;
      const crf = Number(process.env.ATTACHMENTS_VIDEO_CRF) || 23;
      const ok = await this.runFfmpeg(VideoTranscodeService.ffmpegArgs(input, output, { maxWidth, crf }));
      if (!ok) return 'kept';
      const outSize = (await stat(output)).size;
      // Only worth it when the file really shrinks (≥ 15 %).
      if (outSize <= 0 || outSize > row.fileSize * 0.85) {
        this.logger.log(`video ${row.id}: compressed ${outSize} B vs ${row.fileSize} B — original kept`);
        return 'kept';
      }
      const newKey = row.storageKey.replace(/\.[^./]+$/, '') + '-c.mp4';
      await this.minio.uploadStream(newKey, createReadStream(output), 'video/mp4');
      await this.prisma.attachment.update({
        where: { id: row.id },
        data: {
          storageKey: newKey,
          fileSize: outSize,
          mimeType: 'video/mp4',
          fileName: row.fileName.replace(/\.[^./]+$/, '') + '.mp4',
        },
      });
      await this.minio.deleteFile(row.storageKey).catch(() => undefined);
      this.logger.log(`video ${row.id}: ${row.fileSize} B → ${outSize} B (${Math.round((1 - outSize / row.fileSize) * 100)} % smaller)`);
      return 'replaced';
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Runs ffmpeg ; false when the binary is missing or the encode fails (10 min cap). */
  protected runFfmpeg(args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 10 * 60 * 1000);
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString().slice(0, 2000); });
      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (err.code === 'ENOENT') {
          this.ffmpegMissing = true;
          this.logger.warn('ffmpeg not found — videos are stored as uploaded (install ffmpeg in the backend image)');
        } else {
          this.logger.warn(`ffmpeg error: ${err.message}`);
        }
        resolve(false);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) this.logger.warn(`ffmpeg exited ${code}: ${stderr.trim().slice(0, 300)}`);
        resolve(code === 0);
      });
    });
  }
}
