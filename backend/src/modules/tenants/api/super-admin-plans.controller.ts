import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, TenantPlan } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PlansService } from '../application/plans.service';

class UpdatePlanDto {
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  displayName?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  tagline?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  description?: string;

  @IsOptional()
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(0)
  @Max(100_000)
  priceMonthly?: number;

  @IsOptional()
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(0)
  @Max(10_000)
  pricePerUserMonthly?: number;

  @IsOptional()
  @IsEnum(['CAD', 'USD', 'EUR'], {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  currency?: 'CAD' | 'USD' | 'EUR';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxWorkOrdersPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxStorageMb?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxClients?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  features?: string[];

  /// B22 — recurring Stripe Price id (price_…). Empty string clears it.
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  stripePriceId?: string;

  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  recommended?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;
}

/**
 * SA-only plan catalog endpoints (B7.8).
 *
 * GET  /super-admin/plans         — read the live catalog
 * PATCH /super-admin/plans/:code  — edit prices / quotas / features
 *
 * The code itself is immutable (it's the join key with tenant.plan).
 * Stripe wiring would attach `stripeProductId` / `stripePriceId` fields
 * later without changing this contract.
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/plans')
export class SuperAdminPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'Catalogue des plans SaaS (prix + quotas + features)' })
  async list() {
    return this.plans.list();
  }

  @Patch(':code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier un plan (prix / quotas / features)' })
  async update(@Param('code') code: TenantPlan, @Body() dto: UpdatePlanDto) {
    return this.plans.update(code, dto);
  }
}
