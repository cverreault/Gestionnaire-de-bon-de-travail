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

export class CreateAddressTypeDto {
  @ApiProperty({
    example: 'Bureau',
    description: "Nom du type d'emplacement (unique, insensible à la casse)",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'OFFICE',
    description: 'Code unique en majuscules (ex: OFFICE, WAREHOUSE)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Le code doit contenir uniquement des lettres majuscules, chiffres et underscores',
  })
  code: string;

  @ApiPropertyOptional({ description: "Description du type d'emplacement" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: '#3b82f6',
    description: 'Couleur en hexadécimal (#RRGGBB)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @ApiPropertyOptional({
    example: '🖥️',
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
