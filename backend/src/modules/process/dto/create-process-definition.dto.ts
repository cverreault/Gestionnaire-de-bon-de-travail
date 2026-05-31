import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProcessDefinitionDto {
  @ApiProperty({
    example: 'Standard BT',
    description: 'Nom unique du processus',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: 'Processus de bon de travail standard à 7 étapes',
    description: 'Description du processus',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Marquer ce processus comme processus par défaut',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
