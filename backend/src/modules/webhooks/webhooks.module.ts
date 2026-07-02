import { Global, Module } from '@nestjs/common';
import { WebhooksService } from './application/webhooks.service';
import { WebhookPayloadBuilderService } from './application/webhook-payload-builder.service';
import { WebhookFanoutListener } from './application/webhook-fanout.listener';
import { WebhookDispatcherService } from './application/webhook-dispatcher.service';
import { WebhooksController } from './api/webhooks.controller';
import { PublicWebhooksController } from './api/public-webhooks.controller';

/**
 * B9 — Outbound webhooks module.
 *
 * @Global so the fanout listener (which subscribes to `**`) is instantiated
 * with the app and the CRUD service is injectable from the public-api
 * module without an explicit import edge.
 */
@Global()
@Module({
  controllers: [WebhooksController, PublicWebhooksController],
  providers: [
    WebhooksService,
    WebhookPayloadBuilderService,
    WebhookFanoutListener,
    WebhookDispatcherService,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
