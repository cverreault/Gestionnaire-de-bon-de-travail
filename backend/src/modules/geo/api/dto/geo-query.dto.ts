import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class SuggestQueryDto {
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(3, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(120, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  q!: string;
}

export class ResolveQueryDto {
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(3, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(200, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  text!: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(400, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  magicKey?: string;
}

const toNumber = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? undefined : Number(value);

export class PropertyQueryDto {
  @IsOptional()
  @IsUUID('4', { message: i18nValidationMessage('validation.IS_UUID') })
  addressId?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  latitude?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({}, { message: i18nValidationMessage('validation.IS_NUMBER') })
  longitude?: number;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(20, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  streetNumber?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(120, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  street?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(80, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  city?: string;
}
