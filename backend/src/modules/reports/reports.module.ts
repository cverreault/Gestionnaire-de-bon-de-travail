import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PdfGeneratorService } from './application/pdf-generator.service';
import { ReportsService } from './application/reports.service';
import { KpiService } from './application/kpi.service';
import { ReportsController } from './api/reports.controller';

/**
 * B3 — Reports & PDF generation.
 *
 * Capabilities:
 *  - HTML → PDF rendering via puppeteer-core + system Chromium
 *  - Per-work-order PDF (B3.3) and monthly aggregate (B3.6)
 *  - Advanced KPI endpoints feeding the analytics page (B3.4/B3.5)
 *
 * Notes:
 *  - PDF generation is OPT-IN at runtime: if PUPPETEER_EXECUTABLE_PATH
 *    resolves to a missing binary, the service stays loaded but each
 *    render() throws a clear error instead of crashing the boot.
 *  - The module reads its data through PrismaService directly — read
 *    paths only, no events published (consumers are humans + the
 *    monthly cron in B3.6).
 */
@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [PdfGeneratorService, ReportsService, KpiService],
  exports: [ReportsService, PdfGeneratorService, KpiService],
})
export class ReportsModule {}
