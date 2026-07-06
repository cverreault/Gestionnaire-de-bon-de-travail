import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreatePartDto {
  @ApiProperty({ example: 'CBL-RG6-30', description: 'Code unique de la pièce (SKU)' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(60, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  sku: string;

  @ApiProperty({ example: 'Câble RG6 30m' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NAME_REQUIRED') })
  @MaxLength(150, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name: string;

  @ApiPropertyOptional({ description: 'Nom en français (B10.2)' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(150)
  nameFr?: string;

  @ApiPropertyOptional({ description: 'Nom en anglais (B10.2)' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(150)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'un', description: 'Unité (un, m, kg, boîte…)' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(12)
  unit?: string;

  @ApiPropertyOptional({ example: 12.5, description: 'Prix coûtant (CAD)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: i18nValidationMessage('validation.IS_STRING') })
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ example: 24.99, description: 'Prix de vente (CAD)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: i18nValidationMessage('validation.IS_STRING') })
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ example: 5, description: "Seuil d'alerte stock bas (0 = désactivé)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
