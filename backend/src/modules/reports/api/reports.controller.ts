import {
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { ReportsService } from '../application/reports.service';
import { KpiService } from '../application/kpi.service';
import { KpiRangeQueryDto } from './dto/kpi-range-query.dto';

interface JwtUser {
  id: string;
  role: Role;
}

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly kpiService: KpiService,
  ) {}

  @Get('capabilities')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({
    summary: 'PDF generation capabilities',
    description:
      'Indicates whether the server can render PDFs. Used by the UI ' +
      'to hide / disable download buttons when Chromium is missing.',
  })
  capabilities() {
    return { pdfAvailable: this.reportsService.isPdfAvailable() };
  }

  @Get('work-orders/:id/pdf')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({
    summary: 'Download a work order as a PDF (fiche d\'intervention)',
    description:
      'Returns the PDF rendition of the work order. Technicians can ' +
      'only download work orders they are assigned to.',
  })
  @ApiQuery({
    name: 'locale',
    required: false,
    enum: ['fr', 'en'],
    description: 'Locale of the rendered document. Defaults to "fr".',
  })
  async workOrderPdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
    @Query('locale') locale?: string,
  ) {
    const lang: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
    const { buffer, filename } = await this.reportsService.renderWorkOrderPdf(
      id,
      user,
      lang,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  @Get('kpis/resolution-time')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Average + median resolution time per task type',
    description:
      'Returns one row per task type, with completed count and the ' +
      'mean / median resolution time in hours over the range. ' +
      'Default range: last 30 days.',
  })
  async kpiResolutionTime(@Query() q: KpiRangeQueryDto) {
    const range = this.kpiService.parseRange(q.from, q.to);
    const rows = await this.kpiService.resolutionTimeByTaskType(range);
    return { range, rows };
  }

  @Get('kpis/completion-outcome')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Positive vs negative completion counts per task type',
    description:
      'Returns one row per task type with the success rate computed ' +
      'as positive / (positive + negative).',
  })
  async kpiCompletionOutcome(@Query() q: KpiRangeQueryDto) {
    const range = this.kpiService.parseRange(q.from, q.to);
    const rows = await this.kpiService.completionOutcomeByTaskType(range);
    return { range, rows };
  }

  @Get('kpis/sla')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'SLA breach rate per task type',
    description:
      'Counts BTs tracked under an SLA (slaTargetAt in the range) vs ' +
      'those that breached (slaBreachedAt set).',
  })
  async kpiSla(@Query() q: KpiRangeQueryDto) {
    const range = this.kpiService.parseRange(q.from, q.to);
    const rows = await this.kpiService.slaSummaryByTaskType(range);
    return { range, rows };
  }

  @Get('kpis/throughput')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Daily BTs created vs completed',
    description:
      'Returns one bucket per UTC day in the range with the number of ' +
      'BTs created and completed that day. Useful for trend lines.',
  })
  async kpiThroughput(@Query() q: KpiRangeQueryDto) {
    const range = this.kpiService.parseRange(q.from, q.to);
    const buckets = await this.kpiService.throughput(range);
    return { range, buckets };
  }

  @Get('monthly/:year/:month/pdf')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Download the monthly executive report as a PDF',
    description:
      'Aggregates the four KPI sections + cross-cutting totals for ' +
      'the given (year, month). year ∈ [2000, 2100], month ∈ [1, 12].',
  })
  @ApiQuery({
    name: 'locale',
    required: false,
    enum: ['fr', 'en'],
    description: 'Locale of the rendered document. Defaults to "fr".',
  })
  async monthlyReportPdf(
    @Param('year') year: string,
    @Param('month') month: string,
    @Res() res: Response,
    @Query('locale') locale?: string,
  ) {
    const lang: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
    const { buffer, filename } = await this.reportsService.renderMonthlyReportPdf(
      parseInt(year, 10),
      parseInt(month, 10),
      lang,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }
}
