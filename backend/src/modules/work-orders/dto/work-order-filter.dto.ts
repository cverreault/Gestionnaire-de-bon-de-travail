import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsString,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { WorkOrderStatus, WorkOrderType } from '@prisma/client';

export class WorkOrderFilterDto {
  @ApiPropertyOptional({ enum: WorkOrderStatus, description: 'Filtrer par statut' })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ enum: WorkOrderType, description: 'Filtrer par type' })
  @IsOptional()
  @IsEnum(WorkOrderType)
  type?: WorkOrderType;

  @ApiPropertyOptional({ description: 'Filtrer par UUID technicien assigné (Admin seulement)' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({
    description: 'Date planifiée ≥ (ISO 8601)',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  scheduledDateFrom?: string;

  @ApiPropertyOptional({
    description: 'Date planifiée ≤ (ISO 8601)',
    example: '2026-05-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  scheduledDateTo?: string;

  @ApiPropertyOptional({ description: 'Filtrer par priorité minimale (≥)', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  priorityMin?: number;

  @ApiPropertyOptional({
    description: 'Recherche textuelle (titre, référence, nom client, adresse)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer par UUID client (V3)' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par UUID type de tâche (TaskType)' })
  @IsOptional()
  @IsUUID()
  taskTypeId?: string;

  @ApiPropertyOptional({
    description: 'Exclure les BT terminés (COMPLETED_POSITIVE et COMPLETED_NEGATIVE) — ignoré si un filtre status est déjà défini',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  excludeCompleted?: boolean;

  @ApiPropertyOptional({ description: 'Numéro de page (commence à 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Nombre d\'éléments par page (max 500)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 20;
}
