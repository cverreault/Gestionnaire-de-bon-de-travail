import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { VideoTranscodeService } from './video-transcode.service';

/** B64 — the compressed copy replaces the original only when it is really smaller ; failures keep the original. */
class Testable extends VideoTranscodeService {
  public outSize = 1000;
  public ok = true;
  protected async runFfmpeg(args: string[]): Promise<boolean> {
    if (!this.ok) return false;
    await writeFile(args[args.length - 1], Buffer.alloc(this.outSize));
    return true;
  }
}

function build(row: { fileSize: number; mimeType?: string } | null) {
  const prisma = {
    attachment: {
      findUnique: jest.fn().mockResolvedValue(row && { id: 'a1', fileName: 'video-1.mov', fileSize: row.fileSize, mimeType: row.mimeType ?? 'video/quicktime', storageKey: 'work-orders/w/x.mov', workOrderId: 'w' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const minio = {
    getObjectStream: jest.fn().mockResolvedValue(Readable.from(Buffer.alloc(row?.fileSize ?? 0))),
    uploadStream: jest.fn().mockResolvedValue(undefined),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
  return { svc: new Testable(prisma as never, minio as never), prisma, minio };
}

describe('VideoTranscodeService (B64)', () => {
  it('builds a sane ffmpeg command (H.264 ≤ 1280 px, CRF, AAC, faststart)', () => {
    const args = VideoTranscodeService.ffmpegArgs('/tmp/in.mov', '/tmp/out.mp4', { maxWidth: 1280, crf: 26 }).join(' ');
    expect(args).toContain("-vf scale='min(1280,iw)':-2");
    expect(args).toContain('-c:v libx264');
    expect(args).toContain('-crf 26');
    expect(args).toContain('-movflags +faststart');
    expect(args.endsWith('/tmp/out.mp4')).toBe(true);
  });

  it('replaces the object and the row when the encode is much smaller', async () => {
    const { svc, prisma, minio } = build({ fileSize: 10_000 });
    svc.outSize = 2_000;
    await expect(svc.transcode('a1')).resolves.toBe('replaced');
    expect(minio.uploadStream).toHaveBeenCalledWith('work-orders/w/x-c.mp4', expect.anything(), 'video/mp4');
    expect(prisma.attachment.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { storageKey: 'work-orders/w/x-c.mp4', fileSize: 2_000, mimeType: 'video/mp4', fileName: 'video-1.mp4' } });
    expect(minio.deleteFile).toHaveBeenCalledWith('work-orders/w/x.mov');
  });

  it('keeps the original when the gain is under 15 % or ffmpeg fails', async () => {
    const a = build({ fileSize: 10_000 });
    a.svc.outSize = 9_000;
    await expect(a.svc.transcode('a1')).resolves.toBe('kept');
    expect(a.minio.uploadStream).not.toHaveBeenCalled();
    const b = build({ fileSize: 10_000 });
    b.svc.ok = false;
    await expect(b.svc.transcode('a1')).resolves.toBe('kept');
    expect(b.prisma.attachment.update).not.toHaveBeenCalled();
  });

  it('skips non-video rows', async () => {
    const { svc, minio } = build({ fileSize: 10, mimeType: 'image/jpeg' });
    await expect(svc.transcode('a1')).resolves.toBe('skipped');
    expect(minio.getObjectStream).not.toHaveBeenCalled();
  });
});
