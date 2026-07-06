import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AlertsService } from '../application/alerts.service';
import { ALERT_PUBLISHABLE_EVENTS } from '../domain/alert-rule-engine';
import { CreateAlertRuleDto } from './dto/create-alert.dto';
import { UpdateAlertRuleDto } from './dto/update-alert.dto';

/**
 * B10 — Tenant admin CRUD for configurable alert rules.
 *
 * JWT + ADMIN. All operations tenant-scoped via the Prisma middleware.
 */
@ApiTags('Alerts (tenant)')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@Controller('tenant/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('publishable-events')
  @ApiOperation({ summary: 'Liste des événements qu\'une règle peut cibler' })
  publishableEvents(): string[] {
    // TransformInterceptor wraps everything as { success, data, timestamp } —
    // return the raw array so we don't get { data: { data: [...] } }.
    return [...ALERT_PUBLISHABLE_EVENTS];
  }

  @Get()
  @ApiOperation({ summary: 'Lister les règles d\'alerte du tenant' })
  async list(@CurrentUser() actor: { tenantId: string }) {
    return this.alerts.list(actor.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'une règle d\'alerte' })
  async findOne(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
  ) {
    return this.alerts.findOne(actor.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une règle d\'alerte' })
  async create(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Body() dto: CreateAlertRuleDto,
  ) {
    return this.alerts.create({
      tenantId: actor.tenantId,
      createdByUserId: actor.id,
      ...dto,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une règle d\'alerte' })
  async update(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alerts.update(actor.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une règle d\'alerte' })
  async remove(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Param('id') id: string,
  ) {
    await this.alerts.remove(actor.tenantId, id, actor.id);
  }
}
