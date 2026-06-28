import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUrl } from 'class-validator';

class PushKeysDto {
  @ApiProperty({ description: 'p256dh public key from PushManager.subscribe()' })
  @IsString()
  p256dh: string;

  @ApiProperty({ description: 'auth secret from PushManager.subscribe()' })
  @IsString()
  auth: string;
}

/**
 * Mirrors the shape produced by browser PushManager.subscribe().toJSON().
 * The frontend hands it back to the server verbatim — no remapping.
 */
export class PushSubscribeDto {
  @ApiProperty({ description: 'Endpoint URL returned by the browser' })
  @IsUrl({ require_protocol: true })
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @IsObject()
  keys: PushKeysDto;

  @ApiProperty({ required: false, description: 'navigator.userAgent for "Chrome on Linux" labels' })
  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class PushUnsubscribeDto {
  @ApiProperty({ description: 'Endpoint URL to remove' })
  @IsUrl({ require_protocol: true })
  endpoint: string;
}
