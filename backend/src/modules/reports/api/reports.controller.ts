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

interface JwtUser {
  id: string;
  role: Role;
}

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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
}
