import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/**
 * CalendarModule
 *
 * Provides calendar event aggregation (Appointments + scheduled WorkOrders)
 * and full CRUD for standalone Appointments.
 * Depends on PrismaModule (global) for DB access.
 */
@Module({
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
