import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { IDEMPOTENT_METADATA_KEY } from '../contracts/idempotency.contract';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';

/**
 * Marks a mutating handler as replay-safe when the client sends
 * `Idempotency-Key` (ADR-016 §3). Without the header the handler runs as
 * usual, so the web app is unaffected.
 *
 * Applied per route (not globally) so it can be ordered relative to
 * `FileInterceptor`: place `@Idempotent()` ABOVE `@UseInterceptors(FileInterceptor)`
 * on uploads, so the multipart body is parsed before it is hashed.
 */
export function Idempotent(): MethodDecorator {
  return applyDecorators(SetMetadata(IDEMPOTENT_METADATA_KEY, true), UseInterceptors(IdempotencyInterceptor));
}
