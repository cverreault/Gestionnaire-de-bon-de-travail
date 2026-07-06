import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateWorkRequestDto {
  @ApiProperty({ description: 'UUID du type de tâche demandé' })
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  taskTypeId: string;

  @ApiProperty({ description: "UUID d'une adresse appartenant au client" })
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  clientAddressId: string;

  @ApiProperty({ description: 'Description du besoin' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(2000, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  description: string;

  @ApiPropertyOptional({
    description: 'Titre court (par défaut : nom du type de tâche)',
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(255, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  title?: string;
}
