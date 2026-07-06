import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  ALERT_CHANNELS,
  ALERT_PUBLISHABLE_EVENTS,
} from '../../domain/alert-rule-engine';

export class CreateAlertRuleDto {
  @ApiProperty({ example: 'Alerte BT complété négatif' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(120, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(500, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;

  @ApiProperty({ enum: ALERT_PUBLISHABLE_EVENTS })
  @IsIn(ALERT_PUBLISHABLE_EVENTS as unknown as string[], {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  eventName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  processDefinitionId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  fromStatusId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  toStatusId?: string | null;

  @ApiPropertyOptional({ default: [] })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  taskTypeIds?: string[];

  @ApiPropertyOptional({ default: [] })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  templateIds?: string[];

  @ApiPropertyOptional({ default: [], example: ['RESIDENTIAL', 'COMMERCIAL'] })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  clientTypeCodes?: string[];

  @ApiPropertyOptional({ default: [], example: ['RESIDENCE', 'CHALET'] })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  addressTypeCodes?: string[];

  @ApiPropertyOptional({ default: [], example: ['0', '1', '2'] })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  priorityIn?: string[];

  @ApiPropertyOptional({ default: [], example: [Role.ADMIN, Role.DISPATCHER] })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  recipientRoles?: Role[];

  @ApiPropertyOptional({ default: [] })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  recipientUserIds?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  recipientAssignedTechnician?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  recipientClient?: boolean;

  @ApiProperty({ enum: ALERT_CHANNELS, isArray: true })
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayMinSize(1, { message: i18nValidationMessage('validation.ARRAY_MIN_SIZE') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  channels!: string[];

  @ApiProperty({ example: 'BT {{workOrder.referenceNumber}} — {{transition.toLabel}}' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(500, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  titleTemplate!: string;

  @ApiProperty({ example: 'Assigné à {{technician.name}} pour le client {{client.name}}' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(5000, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  bodyTemplate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(500, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  clientTitleTemplate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(5000, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  clientBodyTemplate?: string | null;
}
