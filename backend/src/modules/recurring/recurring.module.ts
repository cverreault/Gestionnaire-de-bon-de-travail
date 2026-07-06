import { Module } from '@nestjs/common';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { RecurringController } from './api/recurring.controller';
import { PublicRecurringController } from './api/public-recurring.controller';
import { RecurringWorkOrdersService } from './application/recurring-work-orders.service';
import { RecurringSpawnerService } from './application/recurring-spawner.service';

/**
 * B11 — Recurring work-order definitions.
 *
 * Depends on WorkOrdersModule for the spawner's WorkOrdersService injection.
 */
@Module({
  imports: [WorkOrdersModule],
  controllers: [RecurringController, PublicRecurringController],
  providers: [RecurringWorkOrdersService, RecurringSpawnerService],
  exports: [RecurringWorkOrdersService],
})
export class RecurringModule {}
