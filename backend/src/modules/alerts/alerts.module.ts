import { Global, Module } from '@nestjs/common';
import { AlertsService } from './application/alerts.service';
import { AlertsListener } from './application/alerts.listener';
import { RecipientResolverService } from './application/recipient-resolver.service';
import { TemplateRendererService } from './application/template-renderer.service';
import { AlertDispatcherService } from './application/alert-dispatcher.service';
import { AlertsController } from './api/alerts.controller';
import { PublicAlertsController } from './api/public-alerts.controller';

/**
 * B10 — Configurable alert rules for work-order events.
 *
 * @Global so the listener (which subscribes to `workOrders.**`) is
 * instantiated with the app, and AlertsService is injectable from the
 * public-api module without an explicit import edge.
 *
 * Depends on the (now @Global) NotificationsModule for its dispatch path.
 */
@Global()
@Module({
  controllers: [AlertsController, PublicAlertsController],
  providers: [
    AlertsService,
    AlertsListener,
    RecipientResolverService,
    TemplateRendererService,
    AlertDispatcherService,
  ],
  exports: [AlertsService],
})
export class AlertsModule {}
