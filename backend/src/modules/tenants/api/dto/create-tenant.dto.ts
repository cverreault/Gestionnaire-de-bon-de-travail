import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantPlan } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/**
 * First ADMIN account provisioned together with the tenant. The SA always
 * creates a tenant *with* an owner so it is immediately usable — an empty
 * tenant with no way in would be a footgun.
 */
export class CreateTenantAdminDto {
  @ApiProperty({ description: 'Email du premier ADMIN', example: 'patron@acme.com' })
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  email!: string;

  @ApiProperty({ description: 'Mot de passe (≥ 8 caractères)' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(8, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  password!: string;

  @ApiProperty({ description: 'Prénom du premier ADMIN', example: 'Jean' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  firstName!: string;

  @ApiProperty({ description: 'Nom du premier ADMIN', example: 'Tremblay' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  lastName!: string;
}

/**
 * SUPER_ADMIN-driven tenant creation (B7.5). Unlike the public SignupDto,
 * the SA may set the plan and override quota caps up-front, and there is no
 * throttle. The `slug` becomes the tenant subdomain (slug.<BASE_DOMAIN>).
 */
export class CreateTenantDto {
  @ApiProperty({
    description:
      'Identifiant URL-safe de l\'espace de travail. Devient le sous-domaine (slug.<domaine>).',
    example: 'acme',
    minLength: 3,
    maxLength: 20,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(3, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(20, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  @Matches(/^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/, {
    message:
      'Le slug doit être en minuscules, sans accents, et peut contenir des chiffres et des tirets. Doit commencer et finir par une lettre ou un chiffre.',
  })
  slug!: string;

  @ApiProperty({ description: 'Nom d\'affichage de l\'espace de travail.', example: 'Acme Corp' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(2, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(60, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name!: string;

  @ApiPropertyOptional({ enum: TenantPlan, default: TenantPlan.FREE })
  @IsOptional()
  @IsEnum(TenantPlan, { message: i18nValidationMessage('validation.IS_ENUM') })
  plan?: TenantPlan;

  // ── Quota overrides (optional — defaults come from the plan/schema) ──
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

  @ApiProperty({ type: CreateTenantAdminDto })
  @ValidateNested()
  @Type(() => CreateTenantAdminDto)
  admin!: CreateTenantAdminDto;
}
