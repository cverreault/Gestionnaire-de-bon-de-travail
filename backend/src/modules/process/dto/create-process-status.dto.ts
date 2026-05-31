import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProcessStatusDto {
  @ApiProperty({
    example: 100,
    description: 'Code numérique unique du statut dans le processus (entier ≥ 0)',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  code: number;

  @ApiProperty({
    example: 'Assigné',
    description: 'Nom du statut',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: '#3b82f6',
    description: 'Couleur hexadécimale du statut (format #RRGGBB)',
    pattern: '^#[0-9A-Fa-f]{6}$',
  })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color doit être au format hexadécimal #RRGGBB',
  })
  color: string;

  @ApiProperty({
    example: 1,
    description: 'Position d\'affichage du statut (entier ≥ 0)',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  position: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Ce statut est-il le statut initial du processus ?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isInitial?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Ce statut correspond-il à l\'étape de dispatch ?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDispatch?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Ce statut correspond-il au début d\'exécution (démarrage) ?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isStart?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Ce statut est-il un terminal positif (succès) ?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isTerminalPositive?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Ce statut est-il un terminal négatif (échec) ?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isTerminalNegative?: boolean;
}
