import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Réponse pour un client temporaire */
export class TemporaryClientResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Marie' })
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  lastName: string;

  @ApiPropertyOptional({ example: 'marie.dupont@example.com', nullable: true })
  email: string | null;

  @ApiPropertyOptional({ example: '+33612345678', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: '12 rue de la Paix', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ example: 'Paris', nullable: true })
  city: string | null;

  @ApiPropertyOptional({ example: '75001', nullable: true })
  postalCode: string | null;

  @ApiPropertyOptional({ example: 'Client récurrent', nullable: true })
  notes: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/** Réponse paginée générique */
export class PaginatedResponseDto<T> {
  @ApiProperty({ description: 'Données de la page courante' })
  data: T[];

  @ApiProperty({ example: 42, description: 'Nombre total d\'enregistrements (toutes pages confondues)' })
  total: number;

  @ApiProperty({ example: 1, description: 'Page courante' })
  page: number;

  @ApiProperty({ example: 20, description: 'Nombre d\'éléments par page' })
  limit: number;

  @ApiProperty({ example: 3, description: 'Nombre total de pages' })
  totalPages: number;
}

/** Réponse pour un client externe (base de données distante) */
export class ExternalClientResponseDto {
  @ApiProperty({ example: '12345', description: 'Identifiant dans la base externe' })
  id: string;

  @ApiProperty({ example: 'Jean' })
  firstName: string;

  @ApiProperty({ example: 'Martin' })
  lastName: string;

  @ApiPropertyOptional({ example: 'jean.martin@example.com', nullable: true })
  email?: string;

  @ApiPropertyOptional({ example: '+33698765432', nullable: true })
  phone?: string;

  @ApiPropertyOptional({ example: '5 avenue Victor Hugo', nullable: true })
  address?: string;

  @ApiPropertyOptional({ example: 'Lyon', nullable: true })
  city?: string;

  @ApiPropertyOptional({ example: '69002', nullable: true })
  postalCode?: string;

  @ApiPropertyOptional({
    example: { account_number: 'CLI-001', contract_type: 'PRO' },
    description: 'Champs supplémentaires issus de la base externe',
    nullable: true,
  })
  metadata?: Record<string, any>;
}

/** Résultat d\'un client dans la recherche unifiée */
export class UnifiedClientResponseDto extends ExternalClientResponseDto {
  @ApiProperty({
    enum: ['temporary', 'external'],
    description: 'Source du client : base locale (temporary) ou base externe (external)',
    example: 'temporary',
  })
  source: 'temporary' | 'external';
}
