import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ProcessSeedService } from './process-seed.service';
import { ProcessService } from './process.service';
import { ProcessController } from './process.controller';
import { ProcessCacheService } from './process-cache.service';
import { ProcessEngineService } from './process-engine.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProcessController],
  providers: [ProcessService, ProcessSeedService, ProcessCacheService, ProcessEngineService],
  exports: [ProcessService, ProcessCacheService, ProcessEngineService],
})
export class ProcessModule {}
