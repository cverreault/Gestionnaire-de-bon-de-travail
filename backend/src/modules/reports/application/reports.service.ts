import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { KpiService } from './kpi.service';
import {
  renderWorkOrderPdfHtml,
  WorkOrderPdfData,
} from '../infrastructure/templates/work-order-pdf.template';
import {
  renderMonthlyReportPdfHtml,
  MonthlyReportData,
} from '../infrastructure/templates/monthly-report-pdf.template';

export interface CurrentUserRef {
  id: string;
  role: Role;
  /** B21 — set for CLIENT portal accounts. */
  clientId?: string | null;
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
    private readonly kpis: KpiService,
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

    // B21 — portal clients: own work orders only, and only once terminal
    // (the report of an in-flight BT is an internal document).
    if (currentUser.role === Role.CLIENT) {
      if (!currentUser.clientId || wo.clientId !== currentUser.clientId) {
        throw new ForbiddenException(
          'Vous ne pouvez télécharger que vos propres bons de travail',
        );
      }
      const terminal =
        wo.status === WorkOrderStatus.COMPLETED_POSITIVE ||
        wo.status === WorkOrderStatus.COMPLETED_NEGATIVE;
      if (!terminal) {
        throw new ForbiddenException(
          'Le rapport est disponible une fois le bon de travail complété',
        );
      }
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
      signatureClient: (wo as unknown as { signatureClient: string | null }).signatureClient ?? null,
      signatureTechnician: (wo as unknown as { signatureTechnician: string | null }).signatureTechnician ?? null,
      signedAt: (wo as unknown as { signedAt: Date | null }).signedAt ?? null,
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

  /**
   * Render the executive monthly report for a given (year, month).
   *
   * Aggregates the four KPI sections + cross-cutting totals. Uses
   * KpiService for the per-type breakdowns and a single targeted
   * Prisma count for the cross-cutting totals so the cron / on-demand
   * endpoint stays close to the existing analytics surface.
   */
  async renderMonthlyReportPdf(
    year: number,
    month: number,
    locale: 'fr' | 'en' = 'fr',
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new BadRequestException(
        'Année / mois invalide : year ∈ [2000, 2100], month ∈ [1, 12]',
      );
    }

    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - 1);
    const range = { from, to };

    const [resolutionTime, completionOutcome, sla, createdCount, completionGroups, slaGroups] =
      await Promise.all([
        this.kpis.resolutionTimeByTaskType(range),
        this.kpis.completionOutcomeByTaskType(range),
        this.kpis.slaSummaryByTaskType(range),
        this.prisma.workOrder.count({
          where: { createdAt: { gte: from, lte: to } },
        }),
        this.prisma.workOrder.groupBy({
          by: ['status'],
          where: {
            status: {
              in: [WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.COMPLETED_NEGATIVE],
            },
            updatedAt: { gte: from, lte: to },
          },
          _count: { _all: true },
        }),
        this.prisma.workOrder.groupBy({
          by: ['slaBreachedAt'],
          where: { slaTargetAt: { gte: from, lte: to } },
          _count: { _all: true },
        }),
      ]);

    const completedPositive =
      completionGroups.find((g) => g.status === WorkOrderStatus.COMPLETED_POSITIVE)?._count
        ._all ?? 0;
    const completedNegative =
      completionGroups.find((g) => g.status === WorkOrderStatus.COMPLETED_NEGATIVE)?._count
        ._all ?? 0;

    const slaTracked = slaGroups.reduce((acc, g) => acc + g._count._all, 0);
    const slaBreached = slaGroups
      .filter((g) => g.slaBreachedAt !== null)
      .reduce((acc, g) => acc + g._count._all, 0);

    const data: MonthlyReportData = {
      year,
      month,
      totals: {
        created: createdCount,
        completed: completedPositive + completedNegative,
        completedPositive,
        completedNegative,
        slaTracked,
        slaBreached,
      },
      resolutionTime: resolutionTime.map((r) => ({
        taskTypeName: r.taskTypeName,
        completedCount: r.completedCount,
        avgResolutionHours: r.avgResolutionHours,
        medianResolutionHours: r.medianResolutionHours,
      })),
      completionOutcome: completionOutcome.map((r) => ({
        taskTypeName: r.taskTypeName,
        positive: r.positive,
        negative: r.negative,
        successRate: r.successRate,
      })),
      sla: sla.map((r) => ({
        taskTypeName: r.taskTypeName,
        tracked: r.tracked,
        breached: r.breached,
        breachRate: r.breachRate,
      })),
    };

    const html = renderMonthlyReportPdfHtml(data, locale);
    const buffer = await this.pdf.render(html);
    const paddedMonth = String(month).padStart(2, '0');
    return { buffer, filename: `rapport-mensuel-${year}-${paddedMonth}.pdf` };
  }
}
