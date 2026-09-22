import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** B55 — one action applied to several work orders at once. */
export enum BatchAction {
  /** Assign a technician (initial step → assign step, or reassign). */
  ASSIGN = 'ASSIGN',
  /** Assign and dispatch in one go (CREATED / ASSIGNED only). */
  DISPATCH = 'DISPATCH',
  /** Back to the initial step — the engine clears the technician. */
  UNASSIGN = 'UNASSIGN',
  /** Transition to the process « Annulé » status (reason required). */
  CANCEL = 'CANCEL',
  /** Set the scheduled date (and optionally the time window). */
  SCHEDULE = 'SCHEDULE',
}

export class BatchWorkOrdersDto {
  @ApiProperty({ description: 'Identifiants des BT (1 à 100)', type: [String] })
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayMinSize(1, { message: i18nValidationMessage('validation.ARRAY_MIN_SIZE') })
  @ArrayMaxSize(100, { message: i18nValidationMessage('validation.ARRAY_MAX_SIZE') })
  @IsUUID('4', { each: true, message: i18nValidationMessage('validation.IS_UUID') })
  ids: string[];

  @ApiProperty({ enum: BatchAction })
  @IsEnum(BatchAction, { message: i18nValidationMessage('validation.IS_ENUM') })
  action: BatchAction;

  @ApiPropertyOptional({ description: 'Technicien — ASSIGN et DISPATCH' })
  @IsOptional()
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  technicianId?: string;

  @ApiPropertyOptional({ description: 'Date planifiée (ISO 8601) — SCHEDULE, optionnel pour DISPATCH' })
  @IsOptional()
  @IsDateString({}, { message: i18nValidationMessage('validation.IS_DATE_STRING') })
  scheduledDate?: string;

  @ApiPropertyOptional({ description: 'Début de plage horaire (ISO 8601) — SCHEDULE' })
  @IsOptional()
  @IsDateString({}, { message: i18nValidationMessage('validation.IS_DATE_STRING') })
  scheduledStartTime?: string;

  @ApiPropertyOptional({ description: 'Fin de plage horaire (ISO 8601) — SCHEDULE' })
  @IsOptional()
  @IsDateString({}, { message: i18nValidationMessage('validation.IS_DATE_STRING') })
  scheduledEndTime?: string;

  @ApiPropertyOptional({ description: 'Raison — obligatoire pour CANCEL' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(1000, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  reason?: string;

  @ApiPropertyOptional({ description: 'Note de dispatch — DISPATCH' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(500, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  note?: string;
}

export interface BatchResult {
  action: BatchAction;
  ok: Array<{ id: string; referenceNumber: string }>;
  failed: Array<{ id: string; referenceNumber: string | null; error: string }>;
}
