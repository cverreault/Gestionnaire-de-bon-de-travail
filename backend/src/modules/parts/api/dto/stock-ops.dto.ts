import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import { Type } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ReceiveStockDto {
  @ApiProperty({ example: 10, description: 'Quantité reçue à l’entrepôt' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'Bon de commande #1234' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(300)
  note?: string;
}

export class AdjustStockDto {
  @ApiProperty({ example: -2, description: 'Delta signé (correction d’inventaire)' })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  quantity: number;

  @ApiPropertyOptional({ description: 'Camion visé — vide = entrepôt' })
  @IsOptional()
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  technicianId?: string;

  @ApiProperty({ example: 'Décompte physique du 6 juillet' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(300)
  note: string;
}

export class TransferStockDto {
  @ApiProperty({ description: 'Technicien (camion) concerné' })
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  technicianId: string;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ enum: ['TO_TECH', 'TO_WAREHOUSE'] })
  @IsIn(['TO_TECH', 'TO_WAREHOUSE'])
  direction: 'TO_TECH' | 'TO_WAREHOUSE';
}
