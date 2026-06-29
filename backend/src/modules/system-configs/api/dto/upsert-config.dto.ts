import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertConfigDto {
  @ApiProperty({ description: 'Valeur à persister (texte brut — chiffrée par le serveur si `encrypted=true`)' })
  @IsString()
  @MaxLength(10_000)
  value: string;

  @ApiProperty({ required: false, default: false, description: 'Si vrai, la valeur est chiffrée AES-GCM avant insertion. Refusé si CONFIG_MASTER_KEY n\'est pas configuré' })
  @IsOptional()
  @IsBoolean()
  encrypted?: boolean;
}
