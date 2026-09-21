import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class TravelReportQueryDto {
  @ApiProperty({ example: '2026-09-01T00:00:00.000Z' })
  @IsDateString({}, { message: i18nValidationMessage('validation.IS_DATE') })
  from!: string;

  @ApiProperty({ example: '2026-09-30T23:59:59.000Z' })
  @IsDateString({}, { message: i18nValidationMessage('validation.IS_DATE') })
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  technicianId?: string;
}
