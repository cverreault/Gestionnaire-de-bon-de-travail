import {
  Controller,
  Get,
  Patch,
  Put,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { FindNotificationsQueryDto } from './dto/find-notifications-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';
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
  constructor(private readonly notifications: NotificationsService) {}

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
}
