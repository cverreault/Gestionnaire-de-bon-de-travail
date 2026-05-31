import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProcessDefinitionDto } from './create-process-definition.dto';

export class UpdateProcessDefinitionDto extends PartialType(
  CreateProcessDefinitionDto,
) {
  @ApiPropertyOptional({
    example: false,
    description: 'Activer ou désactiver ce processus',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
