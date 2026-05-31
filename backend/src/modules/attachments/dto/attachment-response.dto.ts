import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttachmentResponseDto {
  @ApiProperty({ description: 'UUID de la pièce jointe' })
  id: string;

  @ApiProperty({ description: 'Nom original du fichier' })
  fileName: string;

  @ApiProperty({ description: 'Taille du fichier en octets' })
  fileSize: number;

  @ApiProperty({ description: 'Type MIME du fichier' })
  mimeType: string;

  @ApiProperty({ description: 'Clé de stockage MinIO (chemin interne)' })
  storageKey: string;

  @ApiProperty({ description: 'UUID du bon de travail associé' })
  workOrderId: string;

  @ApiProperty({ description: 'Date d\'upload' })
  uploadedAt: Date;

  @ApiPropertyOptional({
    description: 'URL pre-signée de téléchargement (valide 1h) — présente uniquement via /download',
  })
  downloadUrl?: string;
}
