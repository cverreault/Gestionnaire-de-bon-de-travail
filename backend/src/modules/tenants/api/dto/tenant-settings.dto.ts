import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** B48 — company-level settings edited by the tenant ADMIN (Paramètres → Entreprise). */
export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ description: 'Adresse qui reçoit un courriel à chaque travail complété (null pour désactiver)', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  completedJobsEmail?: string | null;
}
