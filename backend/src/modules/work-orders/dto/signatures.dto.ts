import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/**
 * B12 — Payload for POST /work-orders/:id/signatures.
 *
 * Both fields optional individually — the caller can save just the
 * technician signature at completion time and let the client sign later.
 * Explicit `null` clears the stored value (useful for "redo" flows).
 *
 * Values are data-URLs of the form `data:image/png;base64,...`. The
 * MaxLength cap (256 KB) is generous for a signature-canvas PNG at
 * common sizes but keeps a rogue payload from filling the row.
 */
export class SignaturesDto {
  @ApiPropertyOptional({
    description: 'Data-URL PNG de la signature client (peut être null pour effacer).',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(262144)
  @Matches(/^data:image\/png;base64,/, {
    message: i18nValidationMessage('validation.IS_DATA_URL_PNG'),
  })
  signatureClient?: string | null;

  @ApiPropertyOptional({
    description: 'Data-URL PNG de la signature du technicien.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(262144)
  @Matches(/^data:image\/png;base64,/, {
    message: i18nValidationMessage('validation.IS_DATA_URL_PNG'),
  })
  signatureTechnician?: string | null;
}
