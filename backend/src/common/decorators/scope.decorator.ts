import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '../../modules/api-keys/api-keys.service';

export const SCOPE_METADATA_KEY = 'apiKeyScope';

/**
 * Declare the minimum scope an endpoint accepts (B8).
 *
 * `@Scope('read-only')` accepts any of `read-only`, `read-write`, `admin`.
 * `@Scope('read-write')` rejects `read-only`.
 * `@Scope('admin')` accepts only `admin`.
 *
 * Enforced at runtime by `ApiScopeGuard`.
 */
export const Scope = (scope: ApiKeyScope): MethodDecorator & ClassDecorator =>
  SetMetadata(SCOPE_METADATA_KEY, scope);
