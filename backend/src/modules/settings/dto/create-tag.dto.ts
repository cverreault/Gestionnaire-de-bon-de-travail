import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export const TAG_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** B44 — a coloured label the admin defines, then attaches to clients, addresses and work orders. */
export class CreateTagDto {
  @ApiProperty({ example: 'Lumii', description: 'Nom du tag (unique par espace, insensible à la casse)' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NAME_REQUIRED') })
  @MaxLength(40, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name: string;

  @ApiPropertyOptional({ example: '#2563eb', description: 'Couleur hexadécimale (#RRGGBB)' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @Matches(TAG_COLOR_PATTERN, { message: i18nValidationMessage('validation.INVALID_COLOR') })
  color?: string;

  @ApiPropertyOptional({ description: 'Tag proposé dans les sélecteurs (défaut : true)' })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;
}
