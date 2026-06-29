import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PdfGeneratorService } from './pdf-generator.service';

/**
 * Orchestrator that compiles raw rows from Prisma into the HTML
 * input fed to the PDF generator. Renderers (B3.3+, B3.6) hang off
 * this service.
 *
 * Kept thin in B3.1 — concrete report methods land in subsequent
 * slices. Exposing it here lets the controller and the future
 * scheduled-report cron share a single seam.
 */
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
}
