import { Global, Module } from '@nestjs/common';
import { RemindersController } from './api/reminders.controller';
import { RemindersService } from './application/reminders.service';
import { RemindersDispatcher } from './application/reminders-dispatcher.service';

/**
 * B15 — Work-order reminders. @Global so WorkOrdersService can inject
 * `RemindersService` for auto-scheduling on create without an explicit
 * imports edge.
 */
@Global()
@Module({
  controllers: [RemindersController],
  providers: [RemindersService, RemindersDispatcher],
  exports: [RemindersService],
})
export class RemindersModule {}
