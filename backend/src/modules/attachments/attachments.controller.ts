import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';

import { AttachmentsService } from './attachments.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

interface JwtUser {
  id: string;
  role: Role;
}

@ApiTags('Attachments')
@ApiBearerAuth('access-token')
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  // ── Upload ─────────────────────────────────────────────────────────────────

  @Post('work-orders/:workOrderId/attachments')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @HttpCode(HttpStatus.CREATED)
  // B37.5 — must stay ABOVE FileInterceptor so the multipart body is parsed before it is hashed.
  @Idempotent()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Type de fichier non autorisé : ${file.mimetype}`,
            ),
            false,
          );
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Fichier à uploader (max 10 Mo)',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Uploader une pièce jointe',
    description:
      'Upload un fichier vers MinIO et enregistre les métadonnées. ' +
      'Types acceptés : images (jpg/png/gif/webp), documents (pdf/doc/docx/xls/xlsx). ' +
      'Taille max : 10 Mo.',
  })
  @ApiParam({ name: 'workOrderId', description: 'UUID du bon de travail' })
  @ApiResponse({ status: 201, description: 'Fichier uploadé avec succès' })
  @ApiResponse({ status: 400, description: 'Fichier manquant, type ou taille invalide' })
  @ApiResponse({ status: 404, description: 'Bon de travail introuvable' })
  upload(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: JwtUser,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni (champ "file" manquant)');
    }
    return this.attachmentsService.upload(workOrderId, file, currentUser);
  }

  // ── List by WorkOrder ──────────────────────────────────────────────────────

  @Get('work-orders/:workOrderId/attachments')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @ApiOperation({ summary: 'Lister les pièces jointes d\'un bon de travail' })
  @ApiParam({ name: 'workOrderId', description: 'UUID du bon de travail' })
  @ApiResponse({ status: 200, description: 'Liste des pièces jointes' })
  @ApiResponse({ status: 404, description: 'Bon de travail introuvable' })
  findByWorkOrder(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.attachmentsService.findByWorkOrder(workOrderId, currentUser);
  }

  // ── Download (pre-signed URL) ──────────────────────────────────────────────

  @Get('attachments/:id/download')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @ApiOperation({
    summary: 'Obtenir une URL de téléchargement pre-signée',
    description: 'Génère une URL MinIO pre-signée valide pendant 1 heure.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la pièce jointe' })
  @ApiResponse({ status: 200, description: 'Pièce jointe avec URL de téléchargement' })
  @ApiResponse({ status: 404, description: 'Pièce jointe introuvable' })
  getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.attachmentsService.getDownloadUrl(id, currentUser);
  }

  // ── Content (streaming proxy) ──────────────────────────────────────────────

  @Get('attachments/:id/content')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({
    summary: 'Contenu de la pièce jointe (proxy)',
    description:
      'Diffuse le fichier via l\'API (B37.9) — utilisé par l\'app mobile, pour qui l\'hôte MinIO pré-signé n\'est pas joignable.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la pièce jointe' })
  @ApiResponse({ status: 200, description: 'Flux du fichier' })
  @ApiResponse({ status: 404, description: 'Pièce jointe introuvable' })
  async getContent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType, fileSize } =
      await this.attachmentsService.getContent(id, currentUser);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(fileSize));
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(stream);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  @Delete('attachments/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer une pièce jointe',
    description: 'Supprime le fichier de MinIO et les métadonnées. Réservé aux administrateurs.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la pièce jointe' })
  @ApiResponse({ status: 200, description: 'Pièce jointe supprimée' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs' })
  @ApiResponse({ status: 404, description: 'Pièce jointe introuvable' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.attachmentsService.remove(id);
  }
}
