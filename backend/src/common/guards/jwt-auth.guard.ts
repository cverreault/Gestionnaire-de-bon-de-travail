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
  TENANT_IS_IMPLICIT_KEY,
  TENANT_REQUEST_KEY,
  TenantContext,
} from '../contracts/tenant-context.contract';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private context: RequestContextService,
    private prisma: PrismaService,
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
    // Most `/api/v1/*` routes use `ApiKeyAuthGuard` — bail out here so
    // the global JWT guard doesn't shadow it. The exception is the docs
    // (`/api/v1/docs*`) which are behind JWT (subscribers only) : we
    // keep those inside the JWT flow.
    const req = context.switchToHttp().getRequest<{ url?: string }>();
    if (req.url?.startsWith('/api/v1/') && !req.url.startsWith('/api/v1/docs')) {
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
  // @ts-expect-error — Passport awaits handleRequest at runtime; the
  // IAuthGuard interface declares it sync but async is fully supported.
  async handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    ctx?: ExecutionContext,
  ): Promise<TUser> {
    if (err || !user) {
      throw err || new UnauthorizedException('Access token invalide ou expiré');
    }

    if (ctx) {
      const req = ctx.switchToHttp().getRequest();
      const requestTenant = req[TENANT_REQUEST_KEY] as TenantContext | undefined;
      const isImplicit = req[TENANT_IS_IMPLICIT_KEY] === true;
      const userWithTenant = user as unknown as { id: string; tenantId?: string };

      if (
        requestTenant &&
        userWithTenant.tenantId &&
        requestTenant.id !== userWithTenant.tenantId
      ) {
        if (!isImplicit) {
          // Subdomain pinned a specific tenant but the JWT belongs to a
          // different one — token replay against the wrong space. Block.
          throw new ForbiddenException(
            'Ce token n\'appartient pas à cet espace de travail',
          );
        }
        // IP / localhost / apex fallback : there is no subdomain to
        // pin the tenant. The signed JWT is the source of truth, so
        // we swap the request scope to match the user's actual tenant.
        // This is the path SA impersonation takes on self-hosted IP
        // deployments — without it the tenant-scope middleware would
        // narrow every Prisma call to DEFAULT and starve the request.
        await this.swapRequestTenant(req, userWithTenant.tenantId);
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

  /**
   * Rewrites the request's tenant binding to match the JWT's tenantId.
   *
   * Mutates :
   *   - `request[TENANT_REQUEST_KEY]` so downstream code reads the correct
   *     tenant id / slug / name,
   *   - the AsyncLocalStorage context, so the Prisma tenant-scope
   *     middleware filters queries against the right tenant (this is the
   *     critical bit — without it the middleware would still narrow to
   *     the fallback DEFAULT tenant).
   *
   * Raw SQL to fetch slug/name so the lookup itself doesn't get caught by
   * the tenant-scope middleware (the Tenant model is excluded anyway, but
   * raw SQL makes the bypass explicit and dodges any future regressions).
   */
  private async swapRequestTenant(
    req: { [TENANT_REQUEST_KEY]?: TenantContext },
    jwtTenantId: string,
  ): Promise<void> {
    type Row = { id: string; slug: string; name: string; is_active: boolean };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, slug, name, is_active FROM tenants WHERE id = $1 LIMIT 1`,
      jwtTenantId,
    );
    const row = rows[0];

    req[TENANT_REQUEST_KEY] = {
      id: jwtTenantId,
      slug: row?.slug ?? '',
      name: row?.name ?? '',
      isActive: row?.is_active ?? true,
    };
    const current = this.context.current();
    if (current) {
      (current as { tenantId: string }).tenantId = jwtTenantId;
    }
  }
}
