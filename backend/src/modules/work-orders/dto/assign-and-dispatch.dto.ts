import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsDateString, IsString, MaxLength } from 'class-validator';

export class AssignAndDispatchDto {
  @ApiProperty({
    description: 'UUID du technicien à assigner et dispatcher',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  technicianId: string;

  @ApiPropertyOptional({
    description: 'Date planifiée de l\'intervention (ISO 8601)',
    example: '2026-05-15T08:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({
    description: 'Note de dispatch (instructions, contexte)',
    example: 'Accès par l\'entrée latérale. Contacter le client 30 min avant.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
