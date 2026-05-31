import { IsString, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemporaryClientDto {
  @ApiProperty({ example: 'Marie', description: 'Prénom du client' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Dupont', description: 'Nom de famille du client' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: 'marie.dupont@example.com', description: 'Adresse email (optionnel)' })
  @IsOptional()
  @IsEmail({}, { message: 'Email invalide' })
  email?: string;

  @ApiPropertyOptional({ example: '+33612345678', description: 'Numéro de téléphone (optionnel)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '12 rue de la Paix', description: 'Adresse postale (optionnel)' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Paris', description: 'Ville (optionnel)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '75001', description: 'Code postal (optionnel)' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'Client récurrent — préférence matin', description: 'Notes internes (optionnel)' })
  @IsOptional()
  @IsString()
  notes?: string;
}
