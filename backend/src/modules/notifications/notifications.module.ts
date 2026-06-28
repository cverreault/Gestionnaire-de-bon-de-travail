import { Module } from '@nestjs/common';
import { NotificationsController } from './api/notifications.controller';
import { NotificationsService } from './application/notifications.service';
import { NotificationsListener } from './application/notifications.listener';
import { EmailChannelService } from './infrastructure/channels/email-channel.service';

/**
 * Notifications module (B1.1).
 *
 * First user-facing cross-module reactor (audit is operator-facing).
 * Listens for business events and persists a row per recipient. Channel
 * adapters (email, web push) plug under `infrastructure/channels/`.
 * - In-app: built into the controller + UI dropdown.
 * - Email: EmailChannelService, opt-in via SMTP_HOST (console fallback
 *   when absent).
 * - Web Push: TODO B1.3.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsListener, EmailChannelService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
