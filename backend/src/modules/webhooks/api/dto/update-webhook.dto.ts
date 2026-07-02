import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateWebhookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(80, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(
    { require_protocol: true, require_tld: false },
    { message: i18nValidationMessage('validation.IS_URL') },
  )
  url?: string;

  @ApiPropertyOptional({ example: ['workOrders.*'] })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayMinSize(1, { message: i18nValidationMessage('validation.ARRAY_MIN_SIZE') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  subscribedEvents?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;
}
