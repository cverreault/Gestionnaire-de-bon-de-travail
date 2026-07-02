import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateWebhookDto {
  @ApiProperty({ example: 'Zapier integration' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(80, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name!: string;

  @ApiProperty({ example: 'https://hooks.zapier.com/hooks/catch/…' })
  @IsUrl(
    { require_protocol: true, require_tld: false },
    { message: i18nValidationMessage('validation.IS_URL') },
  )
  url!: string;

  @ApiProperty({
    example: ['workOrders.*'],
    description:
      'Exact event names or trailing-wildcard patterns (`workOrders.*`, `*`).',
  })
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayMinSize(1, { message: i18nValidationMessage('validation.ARRAY_MIN_SIZE') })
  @IsString({ each: true, message: i18nValidationMessage('validation.IS_STRING') })
  subscribedEvents!: string[];
}
