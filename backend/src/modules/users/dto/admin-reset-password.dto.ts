import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminResetPasswordDto {
  @ApiProperty({
    example: 'newSecurePassword123',
    minLength: 6,
    description: 'Nouveau mot de passe en clair (haché avant persistance)',
  })
  @IsString()
  @MinLength(6, { message: 'Le mot de passe doit faire au moins 6 caractères' })
  newPassword: string;
}
