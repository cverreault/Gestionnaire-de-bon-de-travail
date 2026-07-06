import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FREQUENCIES } from '../../domain/schedule';

export class CreateRecurringDto {
  @ApiProperty({ example: 'Inspection trimestrielle chauffage' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty()
  @IsString()
  taskTypeId!: string;

  @ApiProperty()
  @IsString()
  clientId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  clientAddressId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  assignedToId?: string | null;

  @ApiPropertyOptional({
    example: 'Inspection {{date}} — Chauffage',
    description: 'Titre du BT à spawner. {{date}} est remplacé par la date du run.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  workOrderTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  workOrderDescription?: string;

  @ApiPropertyOptional({ default: 0, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  priority?: number;

  @ApiProperty({ enum: FREQUENCIES, example: 'MONTHLY' })
  @IsIn(FREQUENCIES as unknown as string[])
  frequency!: string;

  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  interval?: number;

  @ApiPropertyOptional({
    example: [1, 3, 5],
    description: 'WEEKLY seulement. 0 = dimanche, 6 = samedi.',
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  byDayOfWeek?: number[];

  @ApiPropertyOptional({ example: [15] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  byDayOfMonth?: number[];

  @ApiProperty({ example: '2026-07-15T00:00:00.000Z' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}
