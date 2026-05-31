import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

/**
 * Tous les champs de CreateUserDto sont optionnels, sauf `password`
 * qui ne peut pas être modifié via ce DTO (endpoint dédié PATCH /users/me/password).
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {}
