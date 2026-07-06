import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CalendarService } from './calendar.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Calendar')
@ApiBearerAuth('access-token')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // ── Events ─────────────────────────────────────────────────────────────────

  @Get('events')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN) // B21 — explicit: CLIENT portal users must not reach staff routes
  @ApiOperation({
    summary: 'Récupérer les événements du calendrier',
    description:
      'Retourne la liste unifiée des rendez-vous et des bons de travail planifiés ' +
      'dans une plage de dates. ' +
      'Si startDate/endDate sont absents, la plage est calculée selon le paramètre `view` : ' +
      'day = aujourd\'hui, 3days = aujourd\'hui +2j, week = semaine ISO courante, month = mois courant. ' +
      'Filtrable par technicien.',
  })
  @ApiResponse({ status: 200, description: 'Liste des événements calendrier avec éventuels warnings' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getEvents(@Query() query: CalendarQueryDto) {
    return this.calendarService.getEvents(query);
  }

  // ── Appointments — detail ──────────────────────────────────────────────────

  @Get('appointments/:id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Détail d\'un rendez-vous' })
  @ApiParam({ name: 'id', description: 'UUID du rendez-vous' })
  @ApiResponse({ status: 200, description: 'Rendez-vous trouvé' })
  @ApiResponse({ status: 403, description: 'Réservé aux ADMIN/DISPATCHER' })
  @ApiResponse({ status: 404, description: 'Rendez-vous introuvable' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.calendarService.findOneAppointment(id);
  }

  // ── Appointments — create ──────────────────────────────────────────────────

  @Post('appointments')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un rendez-vous',
    description:
      'Réservé aux administrateurs et dispatchers. ' +
      'Un warning (non bloquant) est retourné si un chevauchement de planning est détecté pour le technicien.',
  })
  @ApiResponse({ status: 201, description: 'Rendez-vous créé (+ warnings éventuels)' })
  @ApiResponse({ status: 400, description: 'Données invalides (ex. endTime avant startTime)' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  create(@Body() dto: CreateAppointmentDto) {
    return this.calendarService.createAppointment(dto);
  }

  // ── Appointments — update ──────────────────────────────────────────────────

  @Patch('appointments/:id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Modifier un rendez-vous',
    description:
      'Réservé aux administrateurs et dispatchers. ' +
      'Un warning (non bloquant) est retourné si un chevauchement est détecté après modification.',
  })
  @ApiParam({ name: 'id', description: 'UUID du rendez-vous' })
  @ApiResponse({ status: 200, description: 'Rendez-vous mis à jour (+ warnings éventuels)' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  @ApiResponse({ status: 404, description: 'Rendez-vous introuvable' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.calendarService.updateAppointment(id, dto);
  }

  // ── Appointments — delete ──────────────────────────────────────────────────

  @Delete('appointments/:id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer un rendez-vous',
    description: 'Réservé aux administrateurs et dispatchers.',
  })
  @ApiParam({ name: 'id', description: 'UUID du rendez-vous' })
  @ApiResponse({ status: 200, description: 'Rendez-vous supprimé' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux administrateurs et dispatchers' })
  @ApiResponse({ status: 404, description: 'Rendez-vous introuvable' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.calendarService.deleteAppointment(id);
  }
}
