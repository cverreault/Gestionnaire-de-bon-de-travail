import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** B68 — optional caption sent with the multipart upload (field `title`). */
export class UploadAttachmentDto {
  @ApiPropertyOptional({ description: 'Nom de la photo / pièce jointe (max 120)', example: 'Panneau fibre rack 2' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(120, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  title?: string;
}

/** B68 — rename after the fact ; empty string clears the caption. */
export class RenameAttachmentDto {
  @ApiPropertyOptional({ description: 'Nouveau nom (vide = retirer)', example: 'Panneau fibre rack 2' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(120, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  title?: string;
}
