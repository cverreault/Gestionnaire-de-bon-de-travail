import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** Sources the mobile app may declare (WEB is reserved to the browser endpoint). */
export enum MobileLocationSource {
  MOBILE_FOREGROUND = 'MOBILE_FOREGROUND',
  MOBILE_BACKGROUND = 'MOBILE_BACKGROUND',
}

export const LOCATION_BATCH_MAX = 100;

export class LocationFixDto {
  @ApiProperty({ example: 45.5017 })
  @IsLatitude({ message: i18nValidationMessage('validation.IS_LATITUDE') })
  latitude!: number;

  @ApiProperty({ example: -73.5673 })
  @IsLongitude({ message: i18nValidationMessage('validation.IS_LONGITUDE') })
  longitude!: number;

  @ApiPropertyOptional({ description: 'Accuracy in metres', minimum: 0, maximum: 10000 })
  @IsOptional()
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(0, { message: i18nValidationMessage('validation.MIN') })
  @Max(10000, { message: i18nValidationMessage('validation.MAX') })
  accuracy?: number;

  @ApiProperty({ description: 'Client timestamp of the fix (ISO 8601, UTC)', example: '2026-09-18T14:03:11.000Z' })
  @IsISO8601({ strict: true }, { message: i18nValidationMessage('validation.IS_DATE') })
  recordedAt!: string;

  @ApiProperty({ enum: MobileLocationSource })
  @IsEnum(MobileLocationSource, { message: i18nValidationMessage('validation.INVALID_ENUM') })
  source!: MobileLocationSource;
}

export class LocationBatchDto {
  @ApiProperty({ type: [LocationFixDto], description: `1 to ${LOCATION_BATCH_MAX} fixes` })
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayMinSize(1, { message: i18nValidationMessage('validation.MIN') })
  @ArrayMaxSize(LOCATION_BATCH_MAX, { message: i18nValidationMessage('validation.MAX') })
  @ValidateNested({ each: true })
  @Type(() => LocationFixDto)
  fixes!: LocationFixDto[];
}
