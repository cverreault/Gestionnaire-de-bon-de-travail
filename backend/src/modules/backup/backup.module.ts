import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

/**
 * BackupModule — MinioService now comes from the global StorageModule, so
 * this module no longer needs to import AttachmentsModule (it only ever
 * pulled it in for MinIO access, never AttachmentsService).
 */
@Module({
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
