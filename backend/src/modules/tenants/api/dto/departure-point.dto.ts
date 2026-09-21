import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** B49.2 — a predefined starting point for mileage (office, warehouse, home base…). */
export class CreateDeparturePointDto {
  @ApiProperty({ example: 'Entrepôt' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NAME_REQUIRED') })
  @MaxLength(60, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  label!: string;

  @ApiProperty({ example: '669 rue Principale, Sainte-Marthe, J0P 1W0' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NAME_REQUIRED') })
  @MaxLength(300, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  address!: string;

  @ApiProperty()
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty()
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(-180)
  @Max(180)
  lng!: number;
}
