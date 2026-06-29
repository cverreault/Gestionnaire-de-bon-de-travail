import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenantPlan } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(2, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(60, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name?: string;

  @ApiPropertyOptional({ enum: TenantPlan })
  @IsOptional()
  @IsEnum(TenantPlan, { message: i18nValidationMessage('validation.IS_ENUM') })
  plan?: TenantPlan;

  @ApiPropertyOptional({ description: 'Suspend the tenant without deleting data' })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;

  // ── Quota overrides (SA only)
  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUsers?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxWorkOrdersPerMonth?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxStorageMb?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxClients?: number;
}
