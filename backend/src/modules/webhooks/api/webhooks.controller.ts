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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { WebhooksService } from '../application/webhooks.service';
import { WEBHOOK_PUBLISHABLE_EVENTS } from '../domain/webhook-events';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

/**
 * Admin CRUD for the tenant's own webhook endpoints (B9).
 *
 * JWT-authenticated, ADMIN only. All operations tenant-scoped by the
 * Prisma middleware via the JWT context. Mirrors TenantApiKeysController.
 */
@ApiTags('Webhooks (tenant)')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@Controller('tenant/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get('publishable-events')
  @ApiOperation({
    summary: 'Liste des événements qu\'un webhook peut souscrire',
  })
  publishableEvents(): { data: string[] } {
    return { data: [...WEBHOOK_PUBLISHABLE_EVENTS] };
  }

  @Get()
  @ApiOperation({ summary: 'Lister les webhooks du tenant' })
  async list(@CurrentUser() actor: { tenantId: string }) {
    return { data: await this.webhooks.list(actor.tenantId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un webhook' })
  async findOne(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
  ) {
    return this.webhooks.findOne(actor.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un webhook — le secret est retourné une seule fois',
  })
  async create(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooks.create({
      tenantId: actor.tenantId,
      createdByUserId: actor.id,
      name: dto.name,
      url: dto.url,
      subscribedEvents: dto.subscribedEvents,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un webhook' })
  async update(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhooks.update(actor.tenantId, id, dto);
  }

  @Post(':id/regenerate-secret')
  @ApiOperation({
    summary: 'Régénérer le secret de signature (retourné une seule fois)',
  })
  async regenerate(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Param('id') id: string,
  ) {
    return this.webhooks.regenerateSecret(actor.tenantId, id, actor.id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Envoyer un événement `webhook.test` sur ce webhook (livraison prochaine à ~30s)',
  })
  async triggerTest(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
  ) {
    return this.webhooks.triggerTestDelivery(actor.tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer (soft-delete) un webhook' })
  async remove(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Param('id') id: string,
  ) {
    await this.webhooks.remove(actor.tenantId, id, actor.id);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Log récent des livraisons pour ce webhook' })
  async listDeliveries(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : 50;
    return {
      data: await this.webhooks.listDeliveries(
        actor.tenantId,
        id,
        Number.isFinite(parsed) ? parsed : 50,
      ),
    };
  }

  @Post('deliveries/:deliveryId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Re-mettre en attente une livraison échouée ou abandonnée',
  })
  async retryDelivery(
    @CurrentUser() actor: { tenantId: string },
    @Param('deliveryId') deliveryId: string,
  ) {
    await this.webhooks.retryDelivery(actor.tenantId, deliveryId);
    return { queued: true };
  }
}
