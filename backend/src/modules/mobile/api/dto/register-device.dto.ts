import { DevicePlatform } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** Loose semver: 1.2.3, 1.2.3-beta.1, 1.2.3+42 */
export const APP_VERSION_RE = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;

export class RegisterDeviceDto {
  @IsEnum(DevicePlatform, { message: i18nValidationMessage('validation.INVALID_ENUM') })
  platform!: DevicePlatform;

  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @Matches(APP_VERSION_RE, { message: i18nValidationMessage('validation.INVALID_FORMAT') })
  appVersion!: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @MaxLength(255, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  pushToken?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @MaxLength(64, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  osVersion?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @MaxLength(128, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  model?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @MaxLength(16, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  locale?: string;
}

export class HeartbeatDto {
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @Matches(APP_VERSION_RE, { message: i18nValidationMessage('validation.INVALID_FORMAT') })
  appVersion?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @MaxLength(255, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  pushToken?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @MaxLength(64, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  osVersion?: string;
}
