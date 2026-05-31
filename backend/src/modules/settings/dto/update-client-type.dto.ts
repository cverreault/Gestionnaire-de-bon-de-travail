import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateClientTypeDto } from './create-client-type.dto';

export class UpdateClientTypeDto extends PartialType(CreateClientTypeDto) {
  @ApiPropertyOptional({
    description: 'Activer ou désactiver ce type de client',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
