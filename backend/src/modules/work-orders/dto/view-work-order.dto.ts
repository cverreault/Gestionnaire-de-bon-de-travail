import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** B57 — the app reports when a work order screen is opened and left. */
export class ViewWorkOrderDto {
  @ApiProperty({ enum: ['opened', 'closed'] })
  @IsIn(['opened', 'closed'], { message: i18nValidationMessage('validation.IS_IN') })
  action: 'opened' | 'closed';

  @ApiPropertyOptional({ description: 'Horodatage client (ISO 8601) — défaut : maintenant' })
  @IsOptional()
  @IsDateString({}, { message: i18nValidationMessage('validation.IS_DATE_STRING') })
  at?: string;

  @ApiPropertyOptional({ enum: ['mobile', 'web'], default: 'mobile' })
  @IsOptional()
  @IsIn(['mobile', 'web'], { message: i18nValidationMessage('validation.IS_IN') })
  source?: 'mobile' | 'web';
}
