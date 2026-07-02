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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Scope } from '../../../common/decorators/scope.decorator';
import { CurrentApiKey } from '../../../common/decorators/current-api-key.decorator';
import type { ResolvedApiKey } from '../../api-keys/api-keys.service';
import { PublicApiThrottle } from '../../public-api/public-api-throttle.decorator';
import { WebhooksService } from '../application/webhooks.service';
import { WEBHOOK_PUBLISHABLE_EVENTS } from '../domain/webhook-events';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

/**
 * Public API v1 — Webhooks (B9).
 *
 * Machine-to-machine CRUD for outbound webhook subscriptions. Same shape as
 * the internal `WebhooksController` but authenticated via `X-API-Key` with
 * `@Scope('admin')` — managing webhooks is an admin-level operation
 * (integrators shouldn't accidentally leak an admin key to a read-only
 * integration and expect it to work).
 */
@ApiTags('Webhooks')
@ApiSecurity('api-key')
@PublicApiThrottle()
@Controller('v1/webhooks')
export class PublicWebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get('publishable-events')
  @Scope('read-only')
  @ApiOperation({
    summary: 'Liste des événements publiables auxquels un webhook peut souscrire',
  })
  publishableEvents(): { data: string[] } {
    return { data: [...WEBHOOK_PUBLISHABLE_EVENTS] };
  }

  @Get()
  @Scope('admin')
  @ApiOperation({ summary: 'Lister les webhooks du tenant' })
  async list(@CurrentApiKey() key: ResolvedApiKey) {
    return { data: await this.webhooks.list(key.tenantId) };
  }

  @Get(':id')
  @Scope('admin')
  @ApiOperation({ summary: 'Détail d\'un webhook' })
  async findOne(
    @Param('id') id: string,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.webhooks.findOne(key.tenantId, id);
  }

  @Post()
  @Scope('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un webhook — le secret est retourné une seule fois',
  })
  async create(
    @Body() dto: CreateWebhookDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.webhooks.create({
      tenantId: key.tenantId,
      createdByUserId: key.createdByUserId,
      name: dto.name,
      url: dto.url,
      subscribedEvents: dto.subscribedEvents,
    });
  }

  @Patch(':id')
  @Scope('admin')
  @ApiOperation({ summary: 'Mettre à jour un webhook' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.webhooks.update(key.tenantId, id, dto);
  }

  @Post(':id/regenerate-secret')
  @Scope('admin')
  @ApiOperation({
    summary: 'Régénérer le secret de signature (retourné une seule fois)',
  })
  async regenerate(
    @Param('id') id: string,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.webhooks.regenerateSecret(
      key.tenantId,
      id,
      key.createdByUserId,
    );
  }

  @Delete(':id')
  @Scope('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer (soft-delete) un webhook' })
  async remove(
    @Param('id') id: string,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    await this.webhooks.remove(key.tenantId, id, key.createdByUserId);
  }

  @Get(':id/deliveries')
  @Scope('admin')
  @ApiOperation({ summary: 'Log récent des livraisons pour ce webhook' })
  async listDeliveries(
    @Param('id') id: string,
    @CurrentApiKey() key: ResolvedApiKey,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : 50;
    return {
      data: await this.webhooks.listDeliveries(
        key.tenantId,
        id,
        Number.isFinite(parsed) ? parsed : 50,
      ),
    };
  }
}
