import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { NotificationsService } from '../application/notifications.service';
import { PushChannelService } from '../infrastructure/channels/push-channel.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { FindNotificationsQueryDto } from './dto/find-notifications-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push-subscribe.dto';
import { NOTIFIABLE_EVENTS } from '../application/notification-preferences';

interface JwtUser {
  id: string;
  role: Role;
}

/**
 * In-app notifications inbox.
 *
 * All endpoints are scoped to the current user — there is no
 * "/notifications/:userId" admin view at this stage; the dropdown UI
 * only ever asks for "mine".
 */
@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('me/notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushChannelService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lister mes notifications (les plus récentes en tête, non-lues en premier)',
    description: 'Renvoie items + unreadCount. Pas de pagination par offset à ce stade — le dropdown affiche les N plus récentes.',
  })
  @ApiResponse({ status: 200, description: '{ items, unreadCount }' })
  findMine(
    @Query() query: FindNotificationsQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notifications.findForUser(user.id, {
      unreadOnly: query.unreadOnly,
      limit: query.limit,
    });
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  @ApiParam({ name: 'id', description: 'UUID de la notification' })
  @ApiResponse({ status: 200, description: 'Notification mise à jour' })
  @ApiResponse({ status: 404, description: 'Notification introuvable ou appartient à un autre utilisateur' })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notifications.markRead(id, user.id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer toutes mes notifications comme lues' })
  @ApiResponse({ status: 200, description: '{ marked: N }' })
  markAllRead(@CurrentUser() user: JwtUser) {
    return this.notifications.markAllRead(user.id);
  }

  // ── Preferences (B1.2) ───────────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({
    summary: 'Mes préférences de notifications (avec defaults appliqués)',
    description:
      'Retourne `{ preferences: {...}, events: [...] }` où `preferences` est ' +
      'l\'objet typé fully-populated (defaults + overrides) et `events` énumère ' +
      'les types reconnus côté backend (utile au front pour rendre les cases).',
  })
  async getMyPreferences(@CurrentUser() user: JwtUser) {
    const preferences = await this.notifications.getPreferences(user.id);
    return { preferences, events: NOTIFIABLE_EVENTS };
  }

  @Put('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mettre à jour mes préférences de notifications (sparse patch)',
    description: 'Le body est merged avec les préférences existantes — envoyer uniquement les clés modifiées.',
  })
  async updateMyPreferences(
    @Body() body: UpdateNotificationPreferencesDto,
    @CurrentUser() user: JwtUser,
  ) {
    const preferences = await this.notifications.updatePreferences(
      user.id,
      body as Record<string, { inApp?: boolean; email?: boolean }>,
    );
    return { preferences };
  }

  // ── Web Push (B1.3) ──────────────────────────────────────────────────────

  @Get('push/vapid-public-key')
  @ApiOperation({
    summary: 'VAPID public key for PushManager.subscribe()',
    description: '404 si VAPID n\'est pas configuré côté serveur — le service worker doit alors abandonner la souscription.',
  })
  @ApiResponse({ status: 200, description: '{ publicKey }' })
  @ApiResponse({ status: 404, description: 'Push pas configuré sur ce déploiement' })
  getVapidPublicKey() {
    const publicKey = this.push.getPublicKey();
    if (!publicKey) {
      throw new NotFoundException('Push notifications are not configured on this deployment');
    }
    return { publicKey };
  }

  @Post('push/subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enregistrer une souscription PushManager pour mon utilisateur',
    description: 'Le body suit exactement la forme PushSubscriptionJSON. Upsert par endpoint.',
  })
  async subscribePush(
    @Body() body: PushSubscribeDto,
    @CurrentUser() user: JwtUser,
  ) {
    const row = await this.push.subscribe({
      userId: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: body.userAgent,
    });
    return { id: row.id };
  }

  @Delete('push/subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer une souscription Push de mon utilisateur' })
  unsubscribePush(
    @Body() body: PushUnsubscribeDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.push.unsubscribe(user.id, body.endpoint);
  }
}
