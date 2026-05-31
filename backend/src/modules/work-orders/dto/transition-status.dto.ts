import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';

// ── Custom class-level validator ───────────────────────────────────────────────

/**
 * Ensures that at least one of `status` (legacy enum) or `targetStepId` (dynamic)
 * is present in the request body.
 */
@ValidatorConstraint({ name: 'atLeastOneTarget', async: false })
export class AtLeastOneTargetConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as TransitionStatusDto;
    return !!(obj.status || obj.targetStepId);
  }

  defaultMessage(): string {
    return (
      'Au moins un des champs "status" (enum legacy) ou "targetStepId" (UUID du ProcessStatus cible) est requis.'
    );
  }
}

// ── DTO ────────────────────────────────────────────────────────────────────────

export class TransitionStatusDto {
  /**
   * Sentinelle interne — force la validation croisée status/targetStepId
   * au niveau de l'objet entier via class-validator.
   *
   * - N'est PAS un champ de requête : jamais envoyé par le client.
   * - Marquée optionnelle (`?`) en TypeScript pour que les objets littéraux
   *   `{ status: ... }` restent assignables au type `TransitionStatusDto`
   *   (compatibilité avec les tests unitaires existants).
   * - La validation `@Validate` s'exécute toujours côté HTTP grâce au
   *   `ValidationPipe` (skipMissingProperties=false par défaut dans NestJS).
   */
  @Validate(AtLeastOneTargetConstraint)
  readonly _atLeastOneTarget?: undefined;

  /**
   * UUID du ProcessStatus cible — mode dynamique (process engine).
   * Prend la priorité sur `status` quand les deux sont fournis.
   */
  @ApiPropertyOptional({
    description:
      'UUID du ProcessStatus cible (mode dynamique via ProcessEngine). ' +
      'Prend la priorité sur `status` quand les deux sont fournis.',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsOptional()
  @IsUUID()
  targetStepId?: string;

  /**
   * Statut cible — mode legacy (enum hardcodé).
   * @deprecated Utiliser `targetStepId` (mode dynamique via ProcessEngine).
   */
  @ApiProperty({
    enum: WorkOrderStatus,
    description:
      'Statut cible de la transition (mode legacy). ' +
      'Déprécié — préférer `targetStepId` pour le mode dynamique via ProcessEngine.',
    example: WorkOrderStatus.ASSIGNED,
    required: false,
  })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({
    description: 'UUID du technicien à assigner — obligatoire pour CREATED → ASSIGNED',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({
    description:
      "Raison de l'échec de l'intervention — obligatoire pour IN_PROGRESS → COMPLETED_NEGATIVE",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  negativeReason?: string;

  @ApiPropertyOptional({ description: 'Notes de complétion (optionnel à la clôture)' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  completionNotes?: string;

  @ApiPropertyOptional({
    description:
      "Raison de la ré-ouverture — obligatoire pour COMPLETED_POSITIVE → CREATED. " +
      "Réservé à l'administrateur.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reopenReason?: string;

  @ApiPropertyOptional({
    description:
      'Valeur de updatedAt du BT au moment du dernier fetch (ISO 8601). ' +
      'Si fourni, déclenche un contrôle de verrouillage optimiste : ' +
      'la requête échoue avec 409 si le BT a été modifié entre-temps.',
    example: '2026-05-01T10:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
