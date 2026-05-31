import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProcessStatusDto } from './create-process-status.dto';

/**
 * DTO de mise à jour d'un statut de processus.
 * Le champ `code` est délibérément exclu : il ne peut pas être modifié
 * après création car il sert de clé métier dans les transitions.
 */
export class UpdateProcessStatusDto extends PartialType(
  OmitType(CreateProcessStatusDto, ['code'] as const),
) {}
