import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsUUID, IsEnum } from 'class-validator';

export enum CalendarView {
  DAY = 'day',
  THREE_DAYS = '3days',
  WEEK = 'week',
  MONTH = 'month',
}

export class CalendarQueryDto {
  @ApiPropertyOptional({
    description: 'Date de début de la plage (ISO 8601)',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Date de fin de la plage (ISO 8601)',
    example: '2026-05-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par technicien (UUID)',
  })
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @ApiPropertyOptional({
    description:
      'Vue du calendrier. Détermine la plage automatiquement si startDate/endDate sont absents. ' +
      'day = aujourd\'hui, 3days = aujourd\'hui + 2 jours, week = semaine courante (lun-dim), month = mois courant.',
    enum: CalendarView,
    default: CalendarView.WEEK,
  })
  @IsOptional()
  @IsEnum(CalendarView)
  view?: CalendarView;
}
