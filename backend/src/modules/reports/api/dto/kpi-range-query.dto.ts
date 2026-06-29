import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Common date-range filter for KPI endpoints.
 *
 * Both bounds inclusive. Defaults computed by the service (last 30
 * days ending today) so unauthenticated/unaware UIs still get
 * meaningful numbers.
 */
export class KpiRangeQueryDto {
  @ApiPropertyOptional({
    description: 'ISO-8601 timestamp lower bound (inclusive). Defaults to 30 days ago.',
    example: '2026-06-01T00:00:00Z',
  })
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (typeof value === 'string' && value ? value : undefined))
  from?: string;

  @ApiPropertyOptional({
    description: 'ISO-8601 timestamp upper bound (inclusive). Defaults to now.',
    example: '2026-06-30T23:59:59Z',
  })
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (typeof value === 'string' && value ? value : undefined))
  to?: string;
}
