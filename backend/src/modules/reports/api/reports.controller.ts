import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ReportsService } from '../application/reports.service';

/**
 * B3 reports endpoints.
 *
 * Currently a single capability probe — concrete report endpoints
 * (BT detail PDF, monthly aggregate, KPIs) land in B3.3 / B3.4 /
 * B3.6 and will share the same controller.
 */
@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('capabilities')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'PDF generation capabilities',
    description:
      'Indicates whether the server can render PDFs. Used by the UI ' +
      'to hide / disable download buttons when Chromium is missing.',
  })
  capabilities() {
    return { pdfAvailable: this.reportsService.isPdfAvailable() };
  }
}
