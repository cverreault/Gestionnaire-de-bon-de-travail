import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class FindAuditQueryDto {
  @ApiPropertyOptional({ description: 'Page (>=1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Résultats par page (max 200)', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filtrer par event name exact (ex: workOrders.workOrder.assigned)' })
  @IsOptional()
  @IsString()
  eventName?: string;

  @ApiPropertyOptional({ description: 'Filtrer par aggregateId (ex: workOrderId)' })
  @IsOptional()
  @IsString()
  aggregateId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par utilisateur à l\'origine' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ description: 'occurredAt >= from (ISO 8601)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'occurredAt <= to (ISO 8601)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
