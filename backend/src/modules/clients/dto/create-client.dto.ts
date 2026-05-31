import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientType } from '@prisma/client';

export class CreateClientAddressDto {
  @ApiPropertyOptional({ example: '123', description: 'Numéro civique' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  streetNumber?: string;

  @ApiProperty({ example: 'rue Principale', description: 'Nom de la rue (sans le numéro)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  street: string;

  @ApiPropertyOptional({ example: '301', description: 'Numéro d\'appartement ou d\'unité' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  apartment?: string;

  @ApiProperty({ example: 'Montréal', description: 'Ville' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'H2X 1Y5', description: 'Code postal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  postalCode: string;

  @ApiPropertyOptional({ example: 'Québec', description: 'Province ou état' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({ example: 'Canada', description: 'Pays' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ description: "Code de l'AddressTypeConfig (ex: OFFICE, WAREHOUSE, CAMP, ...)" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  addressType?: string;

  @ApiPropertyOptional({ example: 'Siège social', description: 'Libellé personnalisé' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ example: true, description: 'Adresse par défaut du client' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: 45.5017, description: 'Latitude WGS-84 (−90 à +90)' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -73.5673, description: 'Longitude WGS-84 (−180 à +180)' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Valeurs des champs custom définis par l\'AddressTypeConfig (clé = AddressTypeField.id)',
  })
  @IsOptional()
  typeData?: Record<string, unknown> | null;
}

export class CreateClientDto {
  @ApiProperty({ example: 'Jean', description: 'Prénom du client' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Tremblay', description: 'Nom de famille du client' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ example: 'Construction ABC inc.', description: 'Nom de l\'entreprise (optionnel)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiPropertyOptional({ example: 'jean.tremblay@example.com', description: 'Adresse e-mail' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+15141234567', description: 'Numéro de téléphone' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: ClientType, example: ClientType.RESIDENTIAL, description: 'Type de client' })
  @IsEnum(ClientType)
  clientType: ClientType;

  @ApiPropertyOptional({
    example: 'Client VIP, préférence pour les interventions en matinée.',
    description: 'Notes libres sur le client (max 2 000 caractères)',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    type: [CreateClientAddressDto],
    description: 'Liste des adresses associées au client (max 20)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClientAddressDto)
  @ArrayMaxSize(20)
  addresses?: CreateClientAddressDto[];
}
