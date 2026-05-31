import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({
    example: 'Visite préventive chaudière',
    description: 'Titre du rendez-vous',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'Description détaillée du rendez-vous' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Heure de début (ISO 8601)',
    example: '2026-05-10T09:00:00.000Z',
  })
  @IsDateString()
  startTime: string;

  @ApiProperty({
    description: 'Heure de fin (ISO 8601)',
    example: '2026-05-10T10:30:00.000Z',
  })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ description: 'UUID du technicien assigné au rendez-vous' })
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @ApiPropertyOptional({ description: 'UUID du bon de travail associé' })
  @IsOptional()
  @IsUUID()
  workOrderId?: string;
}
