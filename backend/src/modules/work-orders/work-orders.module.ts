import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { ProcessModule } from '../process/process.module';

/**
 * WorkOrdersModule
 *
 * Provides full CRUD for Bons de Travail (WorkOrders), status-transition workflow,
 * and note management. Depends on PrismaModule (global) for DB access.
 * Imports ProcessModule to delegate status-transitions to the ProcessEngineService.
 */
@Module({
  imports: [ProcessModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
