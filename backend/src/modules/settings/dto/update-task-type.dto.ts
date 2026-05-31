import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTaskTypeDto } from './create-task-type.dto';

/**
 * Tous les champs de CreateTaskTypeDto deviennent optionnels.
 * Le champ isActive permet la désactivation/réactivation manuelle sans passer
 * par le soft-delete (réservé à l'admin via PATCH).
 */
export class UpdateTaskTypeDto extends PartialType(CreateTaskTypeDto) {
  @ApiPropertyOptional({
    description: 'Activer ou désactiver le type de tâche',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
