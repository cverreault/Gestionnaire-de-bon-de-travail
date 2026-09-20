import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { TagsService } from './tags.service';
import { ProcessModule } from '../process/process.module';

@Module({
  imports: [ProcessModule],
  controllers: [SettingsController],
  providers: [SettingsService, TagsService],
  exports: [SettingsService, TagsService],
})
export class SettingsModule {}
