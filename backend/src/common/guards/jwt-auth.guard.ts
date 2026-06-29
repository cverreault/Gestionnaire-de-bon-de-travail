import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestContextService } from '../context/request-context.service';
import {
  TENANT_REQUEST_KEY,
  TenantContext,
} from '../contracts/tenant-context.contract';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private context: RequestContextService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * B6.3 — once Passport has decoded the JWT and looked up the user
   * (handled by JwtStrategy.validate), assert that the token's
   * tenantId matches the sub-domain's tenantId. Otherwise a stolen
   * JWT from tenant A could be replayed against tenant B's URL.
   *
   * Also enriches the AsyncLocalStorage context with the user id so
   * downstream services that already have `tenantId` from the
   * TenantResolverMiddleware now also see `userId`.
   */
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    ctx?: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Access token invalide ou expiré');
    }

    if (ctx) {
      const req = ctx.switchToHttp().getRequest();
      const requestTenant = req[TENANT_REQUEST_KEY] as TenantContext | undefined;
      const userWithTenant = user as unknown as { id: string; tenantId?: string };

      if (
        requestTenant &&
        userWithTenant.tenantId &&
        requestTenant.id !== userWithTenant.tenantId
      ) {
        // Mismatched tenant — token was issued for a different tenant
        // than the sub-domain we received the request on. Hard-block.
        throw new ForbiddenException(
          'Ce token n\'appartient pas à cet espace de travail',
        );
      }

      // Fold the user id into the request context for downstream services.
      const current = this.context.current();
      if (current && userWithTenant.id) {
        // Re-run inside the same store with the userId filled in. We do
        // this via a side-effecting mutation of the existing store entry
        // because re-running would create a new logical scope.
        (current as { userId: string | null }).userId = userWithTenant.id;
      }
    }

    return user;
  }
}
