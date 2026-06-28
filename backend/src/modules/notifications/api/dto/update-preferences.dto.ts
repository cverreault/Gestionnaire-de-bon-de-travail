import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One event's per-channel toggle. Both flags optional so the client can
 * send a sparse patch (only the channel they touched).
 */
class PerEventPrefsDto {
  @ApiProperty({ required: false, description: 'In-app dropdown surface' })
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @ApiProperty({ required: false, description: 'Email delivery (requires SMTP_HOST on the backend)' })
  @IsOptional()
  @IsBoolean()
  email?: boolean;
}

/**
 * Sparse patch — every event key is optional. Unknown event names are
 * stored verbatim but the listener only honours those in NOTIFIABLE_EVENTS.
 */
export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: PerEventPrefsDto, required: false, description: 'Notification on workOrder.assigned' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PerEventPrefsDto)
  'workOrder.assigned'?: PerEventPrefsDto;

  @ApiProperty({ type: PerEventPrefsDto, required: false, description: 'Notification on workOrder.completed' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PerEventPrefsDto)
  'workOrder.completed'?: PerEventPrefsDto;
}
