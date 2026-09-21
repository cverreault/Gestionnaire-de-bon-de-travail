import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
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

export class TravelOriginDto {
  @ApiProperty({ enum: ['GPS', 'POINT', 'COORDS'], description: "GPS = dernière position du technicien assigné ; POINT = point de départ prédéfini ; COORDS = position fournie (téléphone)" })
  @IsIn(['GPS', 'POINT', 'COORDS'])
  type!: 'GPS' | 'POINT' | 'COORDS';

  @ApiPropertyOptional()
  @ValidateIf((o) => o.type === 'POINT')
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  pointId?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.type === 'COORDS')
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.type === 'COORDS')
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(120, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  label?: string;
}

/** B49.2 — compute the mileage of a work order from a chosen origin. */
export class TravelComputeDto {
  @ApiProperty({ type: TravelOriginDto })
  @ValidateNested()
  @Type(() => TravelOriginDto)
  origin!: TravelOriginDto;

  @ApiProperty({ description: 'true = aller-retour, false = aller simple' })
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  roundTrip!: boolean;
}
