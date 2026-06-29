import { Module } from '@nestjs/common';
import { NotificationsController } from './api/notifications.controller';
import { NotificationsService } from './application/notifications.service';
import { NotificationsListener } from './application/notifications.listener';
import { EmailChannelService } from './infrastructure/channels/email-channel.service';
import { PushChannelService } from './infrastructure/channels/push-channel.service';

/**
 * Notifications module (B1).
 *
 * First user-facing cross-module reactor (audit is operator-facing).
 * Listens for business events and persists a row per recipient. Channel
 * adapters live under `infrastructure/channels/`.
 *
 * Channels :
 * - In-app : built into the controller + UI dropdown (always on).
 * - Email : EmailChannelService, opt-in via SMTP_HOST (console fallback
 *   when absent).
 * - Web Push : PushChannelService, opt-in via VAPID_PUBLIC_KEY +
 *   VAPID_PRIVATE_KEY (console fallback when absent).
 *
 * SystemConfigsModule is `@Global()` so SYSTEM_CONFIG_RESOLVER is
 * available to the channel services without an explicit import here.
 * The contract lives in `common/contracts/system-config-resolver.contract.ts`.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsListener,
    EmailChannelService,
    PushChannelService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
