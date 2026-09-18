import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { SYNC_PAGE_MAX } from '../../../../common/contracts/sync-protocol.contract';

export class SyncQueryDto {
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.INVALID_STRING') })
  @MaxLength(512, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_NUMBER') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  @Max(SYNC_PAGE_MAX, { message: i18nValidationMessage('validation.MAX') })
  limit?: number;
}
