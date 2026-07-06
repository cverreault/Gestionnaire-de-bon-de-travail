import { Module } from '@nestjs/common';
import { BillingController } from './api/billing.controller';
import { BillingService } from './application/billing.service';
import { PrimaryAdminGuard } from '../../common/guards/primary-admin.guard';

/**
 * B22 — Stripe subscription billing (tenant SaaS plans).
 * Reads the shared `plans` / `tenants` tables directly (reference data,
 * same posture as the SA tenants module) — no cross-module import.
 */
@Module({
  controllers: [BillingController],
  providers: [BillingService, PrimaryAdminGuard],
})
export class BillingModule {}
