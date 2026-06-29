import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RecordLocationDto {
  @ApiProperty({
    description: 'Latitude WGS84',
    example: 45.5017,
    minimum: -90,
    maximum: 90,
  })
  @IsLatitude({ message: i18nValidationMessage('validation.IS_LATITUDE') })
  latitude!: number;

  @ApiProperty({
    description: 'Longitude WGS84',
    example: -73.5673,
    minimum: -180,
    maximum: 180,
  })
  @IsLongitude({ message: i18nValidationMessage('validation.IS_LONGITUDE') })
  longitude!: number;

  @ApiPropertyOptional({
    description: 'Accuracy in metres as reported by the Geolocation API',
    minimum: 0,
    maximum: 10000,
    example: 8.5,
  })
  @IsOptional()
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(0, { message: i18nValidationMessage('validation.MIN') })
  @Max(10000, { message: i18nValidationMessage('validation.MAX') })
  accuracy?: number;
}
