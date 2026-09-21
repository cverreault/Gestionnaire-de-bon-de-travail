import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../../../common/contracts/tenant-context.contract';
import { SessionsService } from '../application/sessions.service';
import { LoginHistoryQueryDto } from '../dto/login-history.dto';

/** B51 — presence, active sessions and login history (admin views). */
@ApiTags('Auth')
@ApiBearerAuth('access-token')
@Controller('auth/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('presence')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Qui est en ligne (vu depuis < 5 min), depuis quand, nombre de sessions actives' })
  presence(@CurrentTenant() tenant: TenantContext) {
    return this.sessions.presence(tenant.id);
  }

  @Get('history')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Historique des connexions (IP, appareil, date), filtrable par utilisateur / période / type' })
  history(@CurrentTenant() tenant: TenantContext, @Query() q: LoginHistoryQueryDto) {
    return this.sessions.history(tenant.id, {
      userId: q.userId,
      kind: q.kind,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      page: q.page,
      limit: q.limit,
    });
  }

  @Get('users/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Sessions actives d'un utilisateur (début, dernier rafraîchissement, IP, appareil)" })
  userSessions(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.userSessions(tenant.id, id);
  }
}
