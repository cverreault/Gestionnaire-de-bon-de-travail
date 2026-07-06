import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateClientTypeDto {
  @ApiProperty({
    example: 'Résidentiel',
    description: 'Nom du type de client (unique, insensible à la casse). Legacy — écris de préférence nameFr + nameEn.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Nom en français (B10.2)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameFr?: string;

  @ApiPropertyOptional({ description: 'Nom en anglais (B10.2)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string;

  @ApiProperty({
    example: 'RESIDENTIAL',
    description: 'Code unique en majuscules (ex: RESIDENTIAL, COMMERCIAL)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Le code doit contenir uniquement des lettres majuscules, chiffres et underscores',
  })
  code: string;

  @ApiPropertyOptional({ description: 'Description du type de client' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Description en français (B10.2)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionFr?: string;

  @ApiPropertyOptional({ description: 'Description en anglais (B10.2)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionEn?: string;

  @ApiPropertyOptional({
    example: '#10b981',
    description: 'Couleur en hexadécimal (#RRGGBB)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @ApiPropertyOptional({
    example: '🏠',
    description: 'Icône (emoji ou identifiant court)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({
    example: 0,
    description: "Ordre d'affichage dans les listes",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
