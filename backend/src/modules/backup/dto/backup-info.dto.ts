import { ApiProperty } from '@nestjs/swagger';

export class BackupInfoDto {
  @ApiProperty({ example: '1.0.0', description: 'Version courante du logiciel' })
  version: string;

  @ApiProperty({ example: 12, description: "Nombre d'objets stockés sur MinIO" })
  attachmentsCount: number;

  @ApiProperty({
    example: 'taskmgr-backup_v1.0.0_2026-05-01T12-30-45.tar.gz',
    description: 'Nom de fichier suggéré pour le prochain backup',
  })
  suggestedFilename: string;

  @ApiProperty({ example: '2026-05-01T12:30:45.000Z' })
  generatedAt: string;
}

export class RestoreResultDto {
  @ApiProperty({ example: true })
  restored: boolean;

  @ApiProperty({ example: '1.0.0' })
  backupVersion: string;

  @ApiProperty({ example: '2026-05-01T12:35:00.000Z' })
  restoredAt: string;

  @ApiProperty({ example: 12, description: "Nombre d'objets MinIO restaurés" })
  attachmentsRestored: number;
}
