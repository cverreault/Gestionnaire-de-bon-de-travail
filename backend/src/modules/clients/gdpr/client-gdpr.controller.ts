import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ClientGdprService } from './client-gdpr.service';

/**
 * B16 — GDPR/PIPEDA endpoints. ADMIN only.
 */
@ApiTags('Clients — GDPR')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@Controller('clients/:id/gdpr')
export class ClientGdprController {
  constructor(private readonly gdpr: ClientGdprService) {}

  @Get('export')
  @ApiOperation({
    summary: 'Exporter toutes les données d\'un client (JSON téléchargeable)',
  })
  async export(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const blob = await this.gdpr.export(actor.tenantId, id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="client-${id}-export.json"`,
    );
    res.end(JSON.stringify(blob, null, 2));
  }

  @Post('anonymize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Anonymiser un client — droit à l\'oubli. Refuse si des BT actifs subsistent.',
  })
  async anonymize(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Param('id') id: string,
  ) {
    return this.gdpr.anonymize(actor.tenantId, id, actor.id);
  }
}
