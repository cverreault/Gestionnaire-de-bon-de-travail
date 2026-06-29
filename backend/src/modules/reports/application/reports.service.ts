import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PdfGeneratorService } from './pdf-generator.service';
import {
  renderWorkOrderPdfHtml,
  WorkOrderPdfData,
} from '../infrastructure/templates/work-order-pdf.template';

export interface CurrentUserRef {
  id: string;
  role: Role;
}

function clientDisplayName(c: {
  firstName: string;
  lastName: string;
  companyName: string | null;
}): string {
  const person = `${c.firstName} ${c.lastName}`.trim();
  return c.companyName ? `${c.companyName} (${person})` : person;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfGeneratorService,
  ) {}

  isPdfAvailable(): boolean {
    return this.pdf.isAvailable();
  }

  /**
   * Render the PDF "fiche d'intervention" for a single work order.
   *
   * IDOR check: TECHNICIAN can only download a BT they're assigned to.
   * Mirrors the behaviour of WorkOrdersService.findOne — duplicated
   * here instead of imported because cross-module imports between
   * business modules are forbidden by the architecture rules.
   */
  async renderWorkOrderPdf(
    id: string,
    currentUser: CurrentUserRef,
    locale: 'fr' | 'en' = 'fr',
  ): Promise<{ buffer: Buffer; filename: string }> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        currentStep: { select: { name: true } },
        taskType: { select: { name: true } },
        client: {
          select: {
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
            phone: true,
          },
        },
        clientAddress_rel: {
          select: { street: true, city: true, postalCode: true },
        },
        assignedTo: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        notes: {
          select: {
            content: true,
            createdAt: true,
            author: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        attachments: {
          select: { fileName: true, uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!wo) {
      throw new NotFoundException(`Bon de travail #${id} introuvable`);
    }

    if (
      currentUser.role === Role.TECHNICIAN &&
      wo.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez télécharger que vos propres bons de travail',
      );
    }

    const data: WorkOrderPdfData = {
      referenceNumber: wo.referenceNumber,
      title: wo.title,
      description: wo.description,
      status: wo.status,
      currentStepLabel: wo.currentStep?.name ?? null,
      taskTypeLabel: wo.taskType?.name ?? null,
      createdAt: wo.createdAt,
      slaTargetAt: wo.slaTargetAt,
      slaBreachedAt: wo.slaBreachedAt,
      completionNotes: wo.completionNotes,
      negativeReason: wo.negativeReason,
      client: wo.client
        ? {
            name: clientDisplayName(wo.client),
            email: wo.client.email,
            phone: wo.client.phone,
          }
        : null,
      address: wo.clientAddress_rel
        ? {
            street: wo.clientAddress_rel.street,
            city: wo.clientAddress_rel.city,
            postalCode: wo.clientAddress_rel.postalCode,
          }
        : null,
      assignedTo: wo.assignedTo
        ? {
            firstName: wo.assignedTo.firstName,
            lastName: wo.assignedTo.lastName,
            email: wo.assignedTo.email,
            phone: wo.assignedTo.phone,
          }
        : null,
      notes: wo.notes.map((n) => ({
        body: n.content,
        authorName: n.author
          ? `${n.author.firstName} ${n.author.lastName}`
          : '—',
        createdAt: n.createdAt,
      })),
      attachments: wo.attachments.map((a) => ({
        filename: a.fileName,
        uploadedAt: a.uploadedAt,
      })),
    };

    const html = renderWorkOrderPdfHtml(data, locale);
    const buffer = await this.pdf.render(html);
    return { buffer, filename: `BT-${wo.referenceNumber}.pdf` };
  }
}
