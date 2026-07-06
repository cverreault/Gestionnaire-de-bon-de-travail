import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Champs métier qui peuvent être requis lors d'une transition */
export const ALLOWED_REQUIRED_FIELDS = [
  'assignedToId',
  'negativeReason',
  'completionNotes',
  'reopenReason',
] as const;

export type AllowedRequiredField = (typeof ALLOWED_REQUIRED_FIELDS)[number];

export class CreateProcessTransitionDto {
  @ApiProperty({
    description: 'UUID du statut source (from)',
    format: 'uuid',
  })
  @IsUUID()
  fromStatusId: string;

  @ApiProperty({
    description: 'UUID du statut cible (to) — doit être différent de fromStatusId',
    format: 'uuid',
  })
  @IsUUID()
  toStatusId: string;

  @ApiProperty({
    example: 'Assigner',
    description: 'Libellé de la transition. Legacy — écris de préférence labelFr + labelEn.',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiPropertyOptional({ description: 'Libellé en français (B10.2)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  labelFr?: string;

  @ApiPropertyOptional({ description: 'Libellé en anglais (B10.2)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  labelEn?: string;

  @ApiProperty({
    enum: Role,
    isArray: true,
    example: [Role.ADMIN, Role.DISPATCHER],
    description: 'Rôles autorisés à déclencher cette transition (tableau non vide)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  allowedRoles: Role[];

  @ApiPropertyOptional({
    enum: ALLOWED_REQUIRED_FIELDS,
    isArray: true,
    example: ['assignedToId'],
    description:
      'Champs obligatoires lors de la transition. ' +
      'Valeurs autorisées : assignedToId, negativeReason, completionNotes, reopenReason.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn([...ALLOWED_REQUIRED_FIELDS], { each: true })
  requiredFields?: string[];

  @ApiPropertyOptional({
    example: 0,
    description: 'Ordre d\'affichage de la transition (entier, défaut 0)',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
