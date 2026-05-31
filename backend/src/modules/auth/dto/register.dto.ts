import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

/**
 * DTO de création de compte — réservé aux admins.
 * Identique à CreateUserDto mais maintenu séparément pour découpler
 * le flux d'authentification du CRUD utilisateurs.
 */
export class RegisterDto {
  @ApiProperty({ example: 'john.doe@taskmgr.local' })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Le mot de passe doit faire au moins 6 caractères' })
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ enum: Role, default: Role.TECHNICIAN })
  @IsEnum(Role, { message: 'Rôle invalide' })
  role: Role;

  @ApiPropertyOptional({ example: '+33612345678' })
  @IsOptional()
  @IsString()
  phone?: string;
}
