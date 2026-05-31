import { IsOptional, IsString, IsInt, IsEnum, IsBoolean, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClientType } from '@prisma/client';

/** Paramètres de recherche / filtrage pour la liste paginée des clients enrichis */
export class FindAllClientsDto {
  @ApiPropertyOptional({
    example: 'tremblay',
    description: 'Terme de recherche ILIKE sur prénom, nom et email',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ClientType,
    example: ClientType.RESIDENTIAL,
    description: 'Filtrer par type de client',
  })
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrer sur le statut actif/inactif du client',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Numéro de page (base 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, description: 'Résultats par page (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/** Paramètres de recherche pour la liste paginée des clients temporaires */
export class SearchTemporaryClientDto {
  @ApiPropertyOptional({
    example: 'dupont',
    description: 'Terme de recherche (filtrage ILIKE sur prénom, nom, email, téléphone)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Numéro de page (base 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, description: 'Nombre de résultats par page (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/** Paramètres de recherche pour les clients externes */
export class SearchExternalClientDto {
  @ApiPropertyOptional({
    example: 'martin',
    description: 'Terme de recherche (prénom, nom, email, téléphone)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 20, default: 20, description: 'Nombre maximum de résultats retournés (max 50)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

/** Paramètres de la recherche unifiée (temporaires + externes) */
export class UnifiedSearchDto {
  @ApiPropertyOptional({
    example: 'dupont',
    description: 'Terme de recherche dans les deux sources (clients temporaires et base externe)',
    required: false,
  })
  @IsOptional()
  @IsString()
  q?: string;
}
