import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  IsUUID,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { WorkOrderType } from '@prisma/client';

export class CreateWorkOrderDto {
  @ApiProperty({ example: 'Remplacement chauffe-eau', description: 'Titre du bon de travail' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'Description détaillée du travail à effectuer' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: WorkOrderType, example: WorkOrderType.REPAIR, description: 'Type de bon de travail' })
  @IsEnum(WorkOrderType)
  type: WorkOrderType;

  @ApiPropertyOptional({
    description: 'Priorité du BT (1 = très basse, 5 = urgente)',
    minimum: 0,
    maximum: 5,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  priority?: number;

  // ── Client ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'UUID du client temporaire local' })
  @IsOptional()
  @IsUUID()
  temporaryClientId?: string;

  @ApiPropertyOptional({ description: 'Identifiant du client dans la base externe' })
  @IsOptional()
  @IsString()
  externalClientId?: string;

  @ApiPropertyOptional({ description: 'Nom du client externe (cache de référence)' })
  @IsOptional()
  @IsString()
  externalClientName?: string;

  @ApiPropertyOptional({ description: 'Adresse complète d\'intervention' })
  @IsOptional()
  @IsString()
  clientAddress?: string;

  // ── Assignation ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'UUID du technicien assigné' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  // ── Planification ─────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Date planifiée (ISO 8601)', example: '2026-05-10T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ description: 'Heure de début planifiée (ISO 8601)', example: '2026-05-10T08:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledStartTime?: string;

  @ApiPropertyOptional({ description: 'Heure de fin planifiée (ISO 8601)', example: '2026-05-10T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledEndTime?: string;

  // ── Relations V3 ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'UUID du client (module Clients V3)' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'UUID de l\'adresse du client (ClientAddress V3)' })
  @IsOptional()
  @IsUUID()
  clientAddressId?: string;

  @ApiPropertyOptional({ description: 'UUID du type de tâche (TaskType)' })
  @IsOptional()
  @IsUUID()
  taskTypeId?: string;

  @ApiPropertyOptional({
    description: 'Valeurs remplies pour les champs du template associé au taskType (clé = fieldId)',
  })
  @IsOptional()
  templateData?: Record<string, unknown> | null;
}
