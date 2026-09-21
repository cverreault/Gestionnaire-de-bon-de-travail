import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** B48 — company-level settings edited by the tenant ADMIN (Paramètres → Entreprise). */
export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ description: 'Adresse qui reçoit un courriel à chaque travail complété (null pour désactiver)', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  completedJobsEmail?: string | null;

  @ApiPropertyOptional({ description: 'Adresse de départ des techniciens (kilométrage aller-retour) ; null pour retirer', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(300, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  baseAddress?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(-90)
  @Max(90)
  baseLat?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(-180)
  @Max(180)
  baseLng?: number | null;
}
