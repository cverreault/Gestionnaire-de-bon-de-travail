import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ActivatePortalAccountDto {
  @ApiProperty({ description: "Jeton d'invitation reçu par courriel" })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  token: string;

  @ApiProperty({ description: 'Mot de passe choisi (min. 8 caractères)' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(8, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  password: string;
}
