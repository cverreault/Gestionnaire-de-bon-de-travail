import { Module } from '@nestjs/common';
import { NotificationsController } from './api/notifications.controller';
import { NotificationsService } from './application/notifications.service';
import { NotificationsListener } from './application/notifications.listener';

/**
 * Notifications module (B1.1).
 *
 * First user-facing cross-module reactor (audit is operator-facing).
 * Listens for business events and persists a row per recipient. Channel
 * adapters (email, web push) will plug under `infrastructure/` in later
 * iterations — for now the only "delivery" is the in-app dropdown.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
