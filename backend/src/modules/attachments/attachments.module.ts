import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

/**
 * AttachmentsModule
 *
 * Handles file uploads to MinIO and attachment metadata persistence.
 * Depends on PrismaModule (global) for DB access, ConfigModule (global) for
 * env vars, and StorageModule (global) for the shared MinioService.
 */
@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
