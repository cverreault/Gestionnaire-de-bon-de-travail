import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class LoginHistoryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  userId?: string;

  @ApiPropertyOptional({ enum: ['LOGIN', 'LOGIN_2FA', 'FAILED', 'LOGOUT'] })
  @IsOptional()
  @IsIn(['LOGIN', 'LOGIN_2FA', 'FAILED', 'LOGOUT'])
  kind?: 'LOGIN' | 'LOGIN_2FA' | 'FAILED' | 'LOGOUT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: i18nValidationMessage('validation.IS_DATE') })
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: i18nValidationMessage('validation.IS_DATE') })
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
