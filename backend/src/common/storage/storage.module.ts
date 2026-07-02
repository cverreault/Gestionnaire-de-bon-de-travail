import { Global, Module } from '@nestjs/common';
import { MinioService } from './minio.service';

/**
 * StorageModule — shared object-storage infrastructure (MinIO).
 *
 * MinIO is infrastructure, not a business module : like PrismaService it
 * lives in `common/` and is exposed @Global so any feature module can
 * inject MinioService without importing another business module (which
 * ADR-001 forbids). Previously MinioService lived inside AttachmentsModule,
 * forcing `backup` to import AttachmentsModule and `health` to duplicate a
 * MinIO client just to avoid the cross-module import — this module removes
 * both work-arounds.
 */
@Global()
@Module({
  providers: [MinioService],
  exports: [MinioService],
})
export class StorageModule {}
