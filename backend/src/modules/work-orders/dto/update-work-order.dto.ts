import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, MaxLength } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';
import { CreateWorkOrderDto } from './create-work-order.dto';

/**
 * Tous les champs de CreateWorkOrderDto deviennent optionnels.
 * Deux champs supplémentaires sont disponibles, réservés aux techniciens
 * assignés (completionNotes, negativeReason) — l'autorisation est gérée
 * dans le service.
 *
 * Le champ `status` permet aux ADMIN/DISPATCHER de forcer un changement
 * de statut (ex : réassignation vers ASSIGNED depuis n'importe quel statut).
 */
export class UpdateWorkOrderDto extends PartialType(CreateWorkOrderDto) {
  @ApiPropertyOptional({ description: 'Notes de complétion renseignées par le technicien' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  completionNotes?: string;

  @ApiPropertyOptional({ description: 'Raison de l\'échec de l\'intervention (technicien)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  negativeReason?: string;

  @ApiPropertyOptional({
    enum: WorkOrderStatus,
    description: 'Forcer un changement de statut (ADMIN/DISPATCHER uniquement, ex : réassignation)',
  })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;
}
