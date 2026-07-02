import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { BackupService } from './backup.service';
import { BackupInfoDto, RestoreResultDto } from './dto/backup-info.dto';
import { MinioService } from '../../common/storage/minio.service';

const MAX_RESTORE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

@ApiTags('Backup')
@ApiBearerAuth('access-token')
@Controller('backup')
@Roles(Role.ADMIN)
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly minio: MinioService,
  ) {}

  @Get('info')
  @ApiOperation({
    summary: 'Métadonnées sur le prochain backup',
    description: 'Renvoie la version courante et le nom de fichier suggéré.',
  })
  @ApiResponse({ status: 200, type: BackupInfoDto })
  async info(): Promise<BackupInfoDto> {
    const version = this.backupService.getCurrentVersion();
    const keys = await this.minio.listObjectKeys();
    return {
      version,
      attachmentsCount: keys.length,
      suggestedFilename: this.backupService.buildFilename(version),
      generatedAt: new Date().toISOString(),
    };
  }

  @Get('export')
  @ApiOperation({
    summary: 'Télécharger une sauvegarde complète',
    description:
      'Stream tar.gz contenant manifest.json, database.sql (pg_dump) et minio/<key> pour chaque pièce jointe.',
  })
  @ApiResponse({ status: 200, description: 'Archive tar.gz' })
  async export(@Res() res: Response): Promise<void> {
    const filename = this.backupService.buildFilename();
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Permet au browser de lire le filename même en CORS
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    const stream = await this.backupService.createArchiveStream();
    stream.pipe(res);
    stream.on('error', (err) => {
      // Le header est déjà envoyé : on coupe la connexion brutalement.
      res.destroy(err);
    });
  }

  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, _file, cb) => cb(null, `restore-${randomUUID()}.tar.gz`),
      }),
      limits: { fileSize: MAX_RESTORE_SIZE },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archive tar.gz précédemment téléchargée',
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Restaurer une sauvegarde',
    description:
      'Valide la version contenue dans manifest.json, écrase la BD et MinIO. Refus si version ≠ courante.',
  })
  @ApiResponse({ status: 200, type: RestoreResultDto })
  @ApiResponse({ status: 400, description: 'Archive invalide ou version incompatible' })
  async restore(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<RestoreResultDto> {
    if (!file) {
      throw new BadRequestException('Fichier manquant (champ "file")');
    }
    try {
      const result = await this.backupService.restore(file.path);
      return {
        restored: true,
        backupVersion: result.backupVersion,
        attachmentsRestored: result.attachmentsRestored,
        restoredAt: new Date().toISOString(),
      };
    } finally {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
  }
}
