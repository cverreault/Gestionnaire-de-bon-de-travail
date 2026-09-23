import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { VideoTranscodeService } from './application/video-transcode.service';

/**
 * AttachmentsModule
 *
 * Handles file uploads to MinIO and attachment metadata persistence.
 * Depends on PrismaModule (global) for DB access, ConfigModule (global) for
 * env vars, and StorageModule (global) for the shared MinioService.
 */
@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, VideoTranscodeService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
