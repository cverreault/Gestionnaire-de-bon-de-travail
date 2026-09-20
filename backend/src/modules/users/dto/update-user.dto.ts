import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { CreateUserDto } from './create-user.dto';

/**
 * Tous les champs de CreateUserDto sont optionnels, sauf `password`
 * qui ne peut pas être modifié via ce DTO (endpoint dédié PATCH /users/me/password).
 * `isActive` : désactiver un compte déconnecte l'utilisateur partout.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @ApiPropertyOptional({ description: 'false = compte désactivé (sessions et appareils révoqués)' })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;
}
