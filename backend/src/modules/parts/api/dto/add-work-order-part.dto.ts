import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PartSource } from '@prisma/client';
import { i18nValidationMessage } from 'nestjs-i18n';

export class AddWorkOrderPartDto {
  @ApiProperty({ description: 'Pièce du catalogue' })
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  partId: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    enum: PartSource,
    description:
      'Défaut : stock camion pour un technicien, entrepôt pour le bureau',
  })
  @IsOptional()
  @IsEnum(PartSource)
  source?: PartSource;
}
