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
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Scope } from '../../../common/decorators/scope.decorator';
import { CurrentApiKey } from '../../../common/decorators/current-api-key.decorator';
import type { ResolvedApiKey } from '../../../common/contracts/api-key.contract';
import { PublicApiThrottle } from '../../../common/decorators/public-api-throttle.decorator';
import { AlertsService } from '../application/alerts.service';
import { ALERT_PUBLISHABLE_EVENTS } from '../domain/alert-rule-engine';
import { CreateAlertRuleDto } from './dto/create-alert.dto';
import { UpdateAlertRuleDto } from './dto/update-alert.dto';

/**
 * Public API v1 — Alerts (B10).
 *
 * External systems can register alert rules programmatically. All operations
 * require the `admin` scope — an alert rule can send email/SMS on behalf of
 * the tenant, so it's not a read-write-level operation.
 */
@ApiTags('Alerts')
@ApiSecurity('api-key')
@PublicApiThrottle()
@Controller('v1/alerts')
export class PublicAlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('publishable-events')
  @Scope('read-only')
  @ApiOperation({ summary: 'Liste des événements qu\'une règle peut cibler' })
  publishableEvents(): string[] {
    return [...ALERT_PUBLISHABLE_EVENTS];
  }

  @Get()
  @Scope('admin')
  @ApiOperation({ summary: 'Lister les règles d\'alerte du tenant' })
  async list(@CurrentApiKey() key: ResolvedApiKey) {
    return this.alerts.list(key.tenantId);
  }

  @Get(':id')
  @Scope('admin')
  @ApiOperation({ summary: 'Détail d\'une règle d\'alerte' })
  async findOne(
    @Param('id') id: string,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.alerts.findOne(key.tenantId, id);
  }

  @Post()
  @Scope('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une règle d\'alerte' })
  async create(
    @Body() dto: CreateAlertRuleDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.alerts.create({
      tenantId: key.tenantId,
      createdByUserId: key.createdByUserId,
      ...dto,
    });
  }

  @Patch(':id')
  @Scope('admin')
  @ApiOperation({ summary: 'Mettre à jour une règle d\'alerte' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAlertRuleDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.alerts.update(key.tenantId, id, dto);
  }

  @Delete(':id')
  @Scope('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une règle d\'alerte' })
  async remove(
    @Param('id') id: string,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    await this.alerts.remove(key.tenantId, id, key.createdByUserId);
  }
}
