import { PartialType } from '@nestjs/swagger';
import { CreateTemporaryClientDto } from './create-temporary-client.dto';

/** Tous les champs de CreateTemporaryClientDto deviennent optionnels pour la mise à jour partielle */
export class UpdateTemporaryClientDto extends PartialType(CreateTemporaryClientDto) {}
