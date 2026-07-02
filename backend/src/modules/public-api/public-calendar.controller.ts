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
import { Scope } from '../../common/decorators/scope.decorator';
import { PublicApiThrottle } from './public-api-throttle.decorator';
import { CalendarService } from '../calendar/calendar.service';
import { CalendarQueryDto } from '../calendar/dto/calendar-query.dto';
import { CreateAppointmentDto } from '../calendar/dto/create-appointment.dto';
import { UpdateAppointmentDto } from '../calendar/dto/update-appointment.dto';

/**
 * Public API v1 — Calendar (B8).
 *
 * External systems (e.g. field-service scheduling tool) can list events
 * and CRUD appointments. The service already handles overlap detection.
 */
@ApiTags('Calendar')
@ApiSecurity('api-key')
@PublicApiThrottle()
@Controller('v1/calendar')
export class PublicCalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('events')
  @Scope('read-only')
  @ApiOperation({ summary: 'Événements (BTs planifiés + rendez-vous) sur une plage' })
  events(@Query() query: CalendarQueryDto) {
    return this.calendar.getEvents(query);
  }

  @Get('appointments/:id')
  @Scope('read-only')
  @ApiOperation({ summary: 'Détail d\'un rendez-vous' })
  findOne(@Param('id') id: string) {
    return this.calendar.findOneAppointment(id);
  }

  @Post('appointments')
  @Scope('read-write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un rendez-vous (détecte les chevauchements)' })
  create(@Body() dto: CreateAppointmentDto) {
    return this.calendar.createAppointment(dto);
  }

  @Patch('appointments/:id')
  @Scope('read-write')
  @ApiOperation({ summary: 'Modifier un rendez-vous' })
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.calendar.updateAppointment(id, dto);
  }

  @Delete('appointments/:id')
  @Scope('read-write')
  @ApiOperation({ summary: 'Supprimer un rendez-vous' })
  delete(@Param('id') id: string) {
    return this.calendar.deleteAppointment(id);
  }
}
