import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description:
      'Date de référence pour les calculs (ISO 8601). ' +
      'Par défaut = maintenant. Utile pour des simulations ou des rapports rétroactifs.',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  referenceDate?: string;
}
