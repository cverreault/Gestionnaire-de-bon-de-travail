import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Scope } from '../../common/decorators/scope.decorator';
import { CurrentApiKey } from '../../common/decorators/current-api-key.decorator';
import { PublicApiThrottle } from './public-api-throttle.decorator';
import type { ResolvedApiKey } from '../api-keys/api-keys.service';
import { AttachmentsService } from '../attachments/attachments.service';

// Kept in sync with the internal attachments controller — 10 MB cap and
// the same MIME whitelist. If those change there, mirror them here.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
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

/**
 * Public API v1 — Attachments (B8).
 *
 * Same MIME type whitelist + size cap as the internal endpoint. The
 * upload happens in memory (memoryStorage) — Express-multer buffers,
 * MinIO puts, no local temp file.
 *
 * Download returns a pre-signed URL (1h TTL) — the external system does
 * not need to proxy the file through the API layer.
 */
@ApiTags('Attachments')
@ApiSecurity('api-key')
@PublicApiThrottle()
@Controller('v1')
export class PublicAttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('work-orders/:workOrderId/attachments')
  @Scope('read-only')
  @ApiOperation({ summary: 'Lister les pièces jointes d\'un BT' })
  list(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.attachments.findByWorkOrder(workOrderId, asCurrentUser(key));
  }

  @Post('work-orders/:workOrderId/attachments')
  @Scope('read-write')
  @HttpCode(HttpStatus.CREATED)
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
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Uploader une pièce jointe' })
  upload(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu (champ « file »).');
    }
    return this.attachments.upload(workOrderId, file, asCurrentUser(key));
  }

  @Get('attachments/:id/download')
  @Scope('read-only')
  @ApiOperation({ summary: 'URL de téléchargement pre-signée (TTL 1h)' })
  getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.attachments.getDownloadUrl(id, asCurrentUser(key));
  }
}

function asCurrentUser(key: ResolvedApiKey) {
  return { id: key.createdByUserId, role: Role.ADMIN };
}
