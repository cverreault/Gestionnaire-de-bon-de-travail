import { Module } from '@nestjs/common';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { PortalController } from './api/portal.controller';
import { PortalAdminController } from './api/portal-admin.controller';
import { PortalService } from './application/portal.service';
import { PortalInvitationService } from './application/portal-invitation.service';
import { PortalClientEventsListener } from './application/portal-client-events.listener';

/**
 * B21 — client portal (invitations, sanitized reads, work requests).
 *
 * Module boundaries: imports WorkOrdersModule for WorkOrdersService
 * (same precedent as recurring / public-api); email delivery goes
 * through the `portal.invitation.issued` event consumed by the
 * notifications module — no direct import.
 */
@Module({
  imports: [WorkOrdersModule],
  controllers: [PortalController, PortalAdminController],
  providers: [PortalService, PortalInvitationService, PortalClientEventsListener],
})
export class PortalModule {}
