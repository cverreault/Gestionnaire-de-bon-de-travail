import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { CreateClientAddressDto } from './create-client.dto';

/**
 * DTO de mise à jour partielle d'une adresse de client.
 * Tous les champs de CreateClientAddressDto sont optionnels pour PATCH.
 *
 * `clientId` est accepté uniquement par l'endpoint générique
 * (PATCH /clients/addresses/:addressId) pour permettre de lier/délier
 * une adresse à un client. `null` détache l'adresse.
 */
export class UpdateClientAddressDto extends PartialType(CreateClientAddressDto) {
  @ApiPropertyOptional({
    description:
      'UUID du client à rattacher (ou null pour détacher l\'adresse). ' +
      'Uniquement honoré par l\'endpoint générique /clients/addresses/:addressId.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @IsUUID()
  clientId?: string | null;
}
