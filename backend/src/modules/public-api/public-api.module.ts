import { Module } from '@nestjs/common';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { ClientsModule } from '../clients/clients.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { CalendarModule } from '../calendar/calendar.module';
import { SettingsModule } from '../settings/settings.module';
import { ProcessModule } from '../process/process.module';
import { UsersModule } from '../users/users.module';
import { ReportsModule } from '../reports/reports.module';
import { PublicWorkOrdersController } from './public-work-orders.controller';
import { PublicClientsController } from './public-clients.controller';
import { PublicAttachmentsController } from './public-attachments.controller';
import { PublicCalendarController } from './public-calendar.controller';
import { PublicCatalogController } from './public-catalog.controller';

/**
 * Public API v1 module (B8).
 *
 * Registers the five wrapper controllers that expose `/api/v1/*`. Each
 * imports its business module (WorkOrders, Clients, …) purely to reuse
 * the underlying service — no controller-to-controller coupling, no
 * new business logic in this module.
 */
@Module({
  imports: [
    WorkOrdersModule,
    ClientsModule,
    AttachmentsModule,
    CalendarModule,
    SettingsModule,
    ProcessModule,
    UsersModule,
    ReportsModule,
  ],
  controllers: [
    PublicWorkOrdersController,
    PublicClientsController,
    PublicAttachmentsController,
    PublicCalendarController,
    PublicCatalogController,
  ],
  // ApiKeyAuthGuard + ApiScopeGuard are registered as APP_GUARDs in
  // AppModule so they run globally — no per-controller wiring needed.
})
export class PublicApiModule {}
