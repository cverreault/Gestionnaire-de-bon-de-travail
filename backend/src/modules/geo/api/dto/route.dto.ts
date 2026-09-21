import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class LatLngDto {
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(-180)
  @Max(180)
  lng!: number;
}

/** B47 — driving route between two points (the app shows distance / ETA before « Y aller »). */
export class RouteRequestDto {
  @ValidateNested()
  @Type(() => LatLngDto)
  from!: LatLngDto;

  @ValidateNested()
  @Type(() => LatLngDto)
  to!: LatLngDto;

  @IsOptional()
  @IsIn(['fr', 'en'])
  language?: 'fr' | 'en';
}
