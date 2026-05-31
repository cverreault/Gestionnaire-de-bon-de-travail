import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Mot de passe actuel' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'Nouveau mot de passe', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Le nouveau mot de passe doit faire au moins 6 caractères' })
  newPassword: string;
}
