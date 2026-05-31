import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateClientDto } from './create-client.dto';

/**
 * DTO de mise à jour partielle d'un client.
 * Tous les champs de CreateClientDto sont optionnels, à l'exception
 * du tableau `addresses` qui est géré via des routes dédiées.
 */
export class UpdateClientDto extends PartialType(
  OmitType(CreateClientDto, ['addresses'] as const),
) {}
