import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class SignupDto {
  @ApiProperty({
    description:
      'Identifiant URL-safe de l\'espace de travail. Devient le sous-domaine (slug.taskmgr.com).',
    example: 'campingpleinbois',
    minLength: 3,
    maxLength: 20,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(3, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(20, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  @Matches(/^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/, {
    message:
      'Le slug doit être en minuscules, sans accents, et peut contenir des chiffres et des tirets. Doit commencer et finir par une lettre ou un chiffre.',
  })
  slug!: string;

  @ApiProperty({
    description: 'Nom d\'affichage de l\'espace de travail.',
    example: 'Camping Plein Bois',
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(2, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(60, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  organizationName!: string;

  @ApiProperty({ description: 'Email du premier ADMIN', example: 'patron@campingpleinbois.com' })
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  email!: string;

  @ApiProperty({ description: 'Mot de passe (≥ 8 caractères)' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(8, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  password!: string;

  @ApiProperty({ description: 'Prénom du premier ADMIN', example: 'Jean' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  firstName!: string;

  @ApiProperty({ description: 'Nom du premier ADMIN', example: 'Tremblay' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  lastName!: string;
}
