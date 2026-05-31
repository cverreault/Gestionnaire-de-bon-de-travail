import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProcessTransitionDto } from './create-process-transition.dto';

/**
 * DTO de mise à jour d'une transition de processus.
 * `fromStatusId` et `toStatusId` sont exclus : les endpoints de la machine
 * ne doivent pas permettre de changer la paire source/cible après création.
 * Pour recâbler une transition, il faut la supprimer et en créer une nouvelle.
 */
export class UpdateProcessTransitionDto extends PartialType(
  OmitType(CreateProcessTransitionDto, ['fromStatusId', 'toStatusId'] as const),
) {}
