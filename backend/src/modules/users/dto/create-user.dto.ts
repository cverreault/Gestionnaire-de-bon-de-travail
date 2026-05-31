import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'technicien@taskmgr.local', description: 'Adresse email unique' })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6, description: 'Mot de passe en clair (haché avant persistance)' })
  @IsString()
  @MinLength(6, { message: 'Le mot de passe doit faire au moins 6 caractères' })
  password: string;

  @ApiProperty({ example: 'Jean' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  lastName: string;

  @ApiProperty({ enum: Role, default: Role.TECHNICIAN, description: 'Rôle applicatif' })
  @IsEnum(Role, { message: 'Rôle invalide. Valeurs acceptées : ADMIN, DISPATCHER, TECHNICIAN' })
  role: Role;

  @ApiPropertyOptional({ example: '+33612345678', description: 'Numéro de téléphone (optionnel)' })
  @IsOptional()
  @IsString()
  phone?: string;
}
