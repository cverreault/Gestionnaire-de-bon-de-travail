import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { MinioService } from './minio.service';

/**
 * AttachmentsModule
 *
 * Handles file uploads to MinIO and attachment metadata persistence.
 * Depends on PrismaModule (global) for DB access and ConfigModule (global) for env vars.
 */
@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, MinioService],
  exports: [AttachmentsService, MinioService],
})
export class AttachmentsModule {}
