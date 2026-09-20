import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MinioService } from '../../common/storage/minio.service';
import { Role } from '@prisma/client';

/** Allowed MIME types grouped by category */
import { magicBytesMatch } from './magic-bytes';

const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface CurrentUserRef {
  id: string;
  role: Role;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  // ── Upload ─────────────────────────────────────────────────────────────────

  async upload(
    workOrderId: string,
    file: Express.Multer.File,
    currentUser: CurrentUserRef,
  ) {
    // 1. Validate work order exists
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, assignedToId: true },
    });

    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${workOrderId} introuvable`);
    }

    // 2. Technicians can only upload to their own work orders
    if (
      currentUser.role === Role.TECHNICIAN &&
      workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez joindre des fichiers qu\'à vos propres bons de travail',
      );
    }

    // 3. Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Type de fichier non autorisé : ${file.mimetype}. ` +
          `Types acceptés : images (jpg/png/gif/webp), documents (pdf/doc/docx/xls/xlsx)`,
      );
    }

    // 3b. B27 — confirm the magic bytes match the declared MIME (the
    // client Content-Type is untrusted). Blocks e.g. an HTML payload
    // labelled image/png.
    if (file.buffer && !magicBytesMatch(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        `Le contenu du fichier ne correspond pas au type déclaré (${file.mimetype}).`,
      );
    }

    // 4. Validate file size (Multer limit handles this too, but double-check here)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('La taille du fichier dépasse la limite de 10 Mo');
    }

    // 5. Build MinIO storage key: work-orders/{workOrderId}/{uuid}.{ext}
    const ext = path.extname(file.originalname).toLowerCase() || '';
    const objectKey = `work-orders/${workOrderId}/${uuidv4()}${ext}`;

    // 6. Upload to MinIO
    await this.minio.uploadFile(file.buffer, objectKey, file.mimetype, file.size);

    // 7. Persist metadata to DB
    // ADR-016 §2 — bump the aggregate so the mobile delta pull sees the new file.
    const [attachment, touched] = await this.prisma.$transaction([
      this.prisma.attachment.create({
        data: {
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          storageKey: objectKey,
          workOrderId,
        },
      }),
      this.prisma.workOrder.update({ where: { id: workOrderId }, data: { updatedAt: new Date() }, select: { updatedAt: true } }),
    ]);

    this.logger.log(`Attachment ${attachment.id} uploaded for WorkOrder ${workOrderId}`);
    return { ...attachment, workOrderUpdatedAt: touched.updatedAt };
  }

  // ── List ───────────────────────────────────────────────────────────────────

  async findByWorkOrder(workOrderId: string, currentUser?: CurrentUserRef) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, assignedToId: true },
    });

    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${workOrderId} introuvable`);
    }

    // Technicians can only list attachments on their own work orders (IDOR protection)
    if (
      currentUser?.role === Role.TECHNICIAN &&
      workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que les pièces jointes de vos propres bons de travail',
      );
    }

    return this.prisma.attachment.findMany({
      where: { workOrderId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  // ── Download (pre-signed URL) ──────────────────────────────────────────────

  async getDownloadUrl(attachmentId: string, currentUser?: CurrentUserRef) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        workOrder: { select: { assignedToId: true } },
      },
    });

    if (!attachment) {
      throw new NotFoundException(`Pièce jointe #${attachmentId} introuvable`);
    }

    // Technicians can only download attachments from their own work orders (IDOR protection)
    if (
      currentUser?.role === Role.TECHNICIAN &&
      attachment.workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez télécharger que les pièces jointes de vos propres bons de travail',
      );
    }

    const downloadUrl = await this.minio.getFileUrl(attachment.storageKey);

    // Exclude the joined workOrder relation from the response
    const { workOrder: _workOrder, ...attachmentData } = attachment;
    return {
      ...attachmentData,
      downloadUrl,
    };
  }

  // ── Content (streaming proxy, B37.9 / ADR-016 §5) ─────────────────────────

  /**
   * Streams the object through the API instead of handing out a presigned
   * URL : MinIO is usually internal-only in self-hosted deployments, so the
   * mobile app (and any client outside the Docker network) cannot reach the
   * presigned host. Same object-level RBAC as `getDownloadUrl`.
   */
  async getContent(attachmentId: string, currentUser?: CurrentUserRef) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { workOrder: { select: { assignedToId: true } } },
    });

    if (!attachment) {
      throw new NotFoundException(`Pièce jointe #${attachmentId} introuvable`);
    }

    if (
      currentUser?.role === Role.TECHNICIAN &&
      attachment.workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que les pièces jointes de vos propres bons de travail',
      );
    }

    const stream = await this.minio.getObjectStream(attachment.storageKey);
    return {
      stream,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    };
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async remove(attachmentId: string, currentUser?: CurrentUserRef) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { workOrder: { select: { assignedToId: true } } },
    });

    if (!attachment) {
      throw new NotFoundException(`Pièce jointe #${attachmentId} introuvable`);
    }

    // Technicians only delete on their own work orders (same IDOR rule as reads).
    if (
      currentUser?.role === Role.TECHNICIAN &&
      attachment.workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que les pièces jointes de vos propres bons de travail',
      );
    }

    // 1. Remove from MinIO storage
    await this.minio.deleteFile(attachment.storageKey);

    // 2. Remove from DB and bump the aggregate (ADR-016 §2)
    const [, touched] = await this.prisma.$transaction([
      this.prisma.attachment.delete({ where: { id: attachmentId } }),
      this.prisma.workOrder.update({ where: { id: attachment.workOrderId }, data: { updatedAt: new Date() }, select: { updatedAt: true } }),
    ]);

    this.logger.log(`Attachment ${attachmentId} deleted`);
    return { message: 'Pièce jointe supprimée avec succès', workOrderUpdatedAt: touched.updatedAt };
  }
}
