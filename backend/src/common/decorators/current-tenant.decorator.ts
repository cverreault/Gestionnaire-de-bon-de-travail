import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  TENANT_REQUEST_KEY,
  TenantContext,
} from '../contracts/tenant-context.contract';

/**
 * Extracts the resolved tenant context from the request (B6.2).
 *
 * The TenantResolverMiddleware sets `request.tenant` before any
 * controller runs. This decorator simply reads it back so handlers
 * don't have to drill through @Req().
 *
 * Usage :
 *   @Get()
 *   list(@CurrentTenant() tenant: TenantContext) { ... }
 */
export const CurrentTenant = createParamDecorator(
  (_data: undefined, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest();
    return req[TENANT_REQUEST_KEY];
  },
);
