import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Raw token from the verification email link',
    example: 'a1b2c3d4…',
    minLength: 32,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(32, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  token!: string;
}
