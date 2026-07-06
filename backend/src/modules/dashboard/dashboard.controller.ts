import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/** Shape of the JWT payload attached to request.user by JwtStrategy */
interface JwtUser {
  id: string;
  role: Role;
}

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ── Admin KPIs ─────────────────────────────────────────────────────────────

  @Get('stats')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Statistiques globales (Admin et Dispatcher)',
    description:
      'Retourne les KPIs globaux : répartition des BT par statut, ' +
      'BT créés aujourd\'hui / cette semaine, BT en retard, ' +
      'charge de travail par technicien (actifs + complétés aujourd\'hui), ' +
      'et les 10 derniers BT créés.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques globales',
    schema: {
      example: {
        workOrdersByStatus: [{ status: 'CREATED', count: 5 }],
        workOrdersToday: 3,
        workOrdersThisWeek: 14,
        overdueWorkOrders: 2,
        technicianStats: [
          { id: 'uuid', name: 'Jean Dupont', activeWorkOrders: 4, completedToday: 2 },
        ],
        recentWorkOrders: [],
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  getStats(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getAdminStats(query);
  }

  // ── Technician personal KPIs ───────────────────────────────────────────────

  @Get('technician-stats')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @ApiOperation({
    summary: 'Statistiques personnelles du technicien connecté',
    description:
      'Retourne les KPIs du technicien authentifié : ' +
      'BT actifs, BT complétés aujourd\'hui et cette semaine, ' +
      'prochains BT planifiés (max 10) et BT en retard.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques du technicien',
    schema: {
      example: {
        myActiveWorkOrders: 3,
        myCompletedToday: 1,
        myCompletedThisWeek: 5,
        myUpcoming: [],
        myOverdue: 0,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getTechnicianStats(
    @Query() query: DashboardQueryDto,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.dashboardService.getTechnicianStats(currentUser.id, query);
  }
}
