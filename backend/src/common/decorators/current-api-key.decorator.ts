import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ResolvedApiKey } from '../contracts/api-key.contract';
import { API_KEY_REQUEST_KEY } from '../guards/api-key-auth.guard';

/**
 * Injects the authenticated API key into a controller method.
 * Analogous to `@CurrentUser()` for JWT-authenticated routes.
 *
 * @example
 * async list(@CurrentApiKey() key: ResolvedApiKey) { ... }
 */
export const CurrentApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ResolvedApiKey | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return (req as Request & Record<string, unknown>)[API_KEY_REQUEST_KEY] as
      | ResolvedApiKey
      | undefined;
  },
);
