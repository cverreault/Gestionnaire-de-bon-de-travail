import {
  Controller,
  Get,
  Patch,
  Param,
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
}
