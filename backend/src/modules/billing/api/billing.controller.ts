import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, TenantPlan } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { PrimaryAdminGuard } from '../../../common/guards/primary-admin.guard';
import type { TenantContext } from '../../../common/contracts/tenant-context.contract';
import { BillingService } from '../application/billing.service';

class CreateCheckoutSessionDto {
  @IsEnum(TenantPlan, { message: i18nValidationMessage('validation.IS_STRING') })
  planCode: TenantPlan;
}

/**
 * B22 — Stripe billing endpoints.
 *
 * checkout/portal are restricted to the tenant's PRIMARY admin (same
 * gate as the subscription screen). The webhook is public but verified
 * by Stripe signature against the raw body. Raw returns everywhere —
 * TransformInterceptor wraps.
 */
@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('status')
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Le paiement en ligne est-il configuré, pour quels plans ?' })
  status() {
    return this.billing.getStatus();
  }

  @Post('checkout-session')
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @UseGuards(PrimaryAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: "Démarrer un Stripe Checkout pour changer de plan (admin principal)",
  })
  createCheckout(
    @Body() dto: CreateCheckoutSessionDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.billing.createCheckoutSession(tenant.id, dto.planCode);
  }

  @Post('portal-session')
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @UseGuards(PrimaryAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Ouvrir le portail de facturation Stripe (factures, carte, annulation)',
  })
  createPortal(@CurrentTenant() tenant: TenantContext) {
    return this.billing.createPortalSession(tenant.id);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook Stripe (signé) — bascule automatique du plan du tenant',
  })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
