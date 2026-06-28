import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateTaskTypeDto {
  @ApiProperty({
    example: 'PLB',
    description: 'Préfixe unique utilisé pour la génération des numéros de référence',
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.PREFIX_REQUIRED') })
  @MaxLength(10, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  @Matches(/^[A-Za-z0-9]+$/, { message: i18nValidationMessage('validation.ALPHANUM_ONLY') })
  prefix: string;

  @ApiProperty({
    example: 'Plomberie',
    description: 'Nom du type de tâche (unique, insensible à la casse)',
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NAME_REQUIRED') })
  @MaxLength(100, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name: string;

  @ApiPropertyOptional({ description: 'Description du type de tâche' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: '#FF5733',
    description: 'Couleur en hexadécimal (#RRGGBB)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @ApiPropertyOptional({
    example: 'wrench',
    description: "Nom de l'icône (identifiant de bibliothèque d'icônes)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({
    description: 'UUID du template de formulaire associé à ce type de tâche',
  })
  @IsOptional()
  @IsString()
  templateId?: string | null;

  @ApiPropertyOptional({
    description:
      'UUID du processus de workflow associé. Si null, les BT créés pour ce ' +
      'type utilisent le processus par défaut.',
  })
  @IsOptional()
  @IsString()
  processDefinitionId?: string | null;

  @ApiPropertyOptional({
    description:
      'SLA en heures — chaque BT de ce type doit être complété dans ce délai ' +
      'après création. Null = pas de SLA suivi. Clamp [1, 4380] = 1h à 6 mois.',
    example: 48,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4380)
  slaHours?: number | null;
}
