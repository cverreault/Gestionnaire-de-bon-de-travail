import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAddressTypeDto } from './create-address-type.dto';

export class UpdateAddressTypeDto extends PartialType(CreateAddressTypeDto) {
  @ApiPropertyOptional({
    description: "Activer ou désactiver ce type d'emplacement",
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: "ID du champ custom à afficher en mode prédominant (peut être null pour retirer)",
  })
  @IsOptional()
  @IsString()
  predominantFieldId?: string | null;
}
