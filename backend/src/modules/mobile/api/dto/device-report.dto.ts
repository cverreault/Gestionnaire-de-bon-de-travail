import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** Self-reported diagnostics from the app (B38 support) : logged server-side, never shown to other users. */
export class DeviceReportDto {
  @IsObject({ message: i18nValidationMessage('validation.INVALID_OBJECT') })
  state!: Record<string, unknown>;

  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayMaxSize(300, { message: i18nValidationMessage('validation.MAX') })
  events!: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @MaxLength(1000, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  note?: string;
}
