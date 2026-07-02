import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';
import { RequestContextService } from '../context/request-context.service';
import {
  TENANT_IS_IMPLICIT_KEY,
  TENANT_REQUEST_KEY,
  TenantContext,
} from '../contracts/tenant-context.contract';
import { PrismaService } from '../prisma/prisma.service';

export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_REQUEST_KEY = 'apiKey';

/**
 * Authenticates a `/api/v1/*` request via the `X-API-Key` header (B8).
 *
 * On success :
 *   - Attaches the resolved key to `req[API_KEY_REQUEST_KEY]` so
 *     `@CurrentApiKey()` and the `ApiScopeGuard` can pick it up.
 *   - Rewrites `req.tenant` + the AsyncLocalStorage tenant to match the
 *     key's owner. The `TenantResolverMiddleware` ran first and set the
 *     tenant from the Host — for machine callers that value is
 *     irrelevant (the key IS the tenant claim).
 *
 * Auth-time DB lookups use raw SQL inside `ApiKeysService.resolveByPlaintext`
 * to sidestep the Prisma tenant-scope middleware — the middleware would
 * otherwise inject the "current" tenant into the `WHERE`, and the current
 * tenant is exactly what we are trying to determine.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    // Belt-and-suspenders: when registered as APP_GUARD, this guard runs on
    // every route. It's only meaningful on `/api/v1/*` — everything else
    // must be handled by JwtAuthGuard, so we short-circuit here.
    //
    // The Swagger UI + spec (`/api/v1/docs*`) require JWT auth via the
    // frontend page rather than an API key — a subscriber to the platform
    // consults the docs BEFORE creating an API key. JwtAuthGuard handles
    // that path, so we short-circuit here too (letting the JWT guard
    // enforce auth).
    if (
      !req.url?.startsWith('/api/v1/') ||
      req.url.startsWith('/api/v1/docs')
    ) {
      return true;
    }

    const raw = req.headers[API_KEY_HEADER];
    const plaintext = Array.isArray(raw) ? raw[0] : raw;
    if (!plaintext) {
      throw new UnauthorizedException(`Header ${API_KEY_HEADER} manquant`);
    }

    const key = await this.apiKeys.resolveByPlaintext(plaintext);
    if (!key) {
      throw new UnauthorizedException(
        'Clé API invalide, révoquée ou expirée',
      );
    }

    // Fire-and-forget last-used bump. Never blocks the request.
    void this.apiKeys.touch(key.id);

    // Attach for downstream code.
    (req as Request & Record<string, unknown>)[API_KEY_REQUEST_KEY] = key;

    // Rewrite the request tenant + AsyncLocalStorage context to match
    // the key's owner. See swapRequestTenant() in JwtAuthGuard for the
    // same pattern used on IP-based JWT flows.
    await this.swapRequestTenant(req, key.tenantId);
    return true;
  }

  private async swapRequestTenant(
    req: Request,
    apiKeyTenantId: string,
  ): Promise<void> {
    type Row = { id: string; slug: string; name: string; is_active: boolean };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, slug, name, is_active FROM tenants WHERE id = $1 LIMIT 1`,
      apiKeyTenantId,
    );
    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException(
        'Tenant introuvable pour cette clé API',
      );
    }
    if (!row.is_active) {
      throw new UnauthorizedException(
        'Tenant désactivé — la clé ne peut plus être utilisée',
      );
    }
    const tenant: TenantContext = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      isActive: row.is_active,
    };
    (req as Request & { [TENANT_REQUEST_KEY]: TenantContext })[
      TENANT_REQUEST_KEY
    ] = tenant;
    // Public API access is explicit through the key — mark the tenant
    // as non-implicit so downstream layers don't apply any IP-fallback
    // heuristics.
    (req as Request & { [TENANT_IS_IMPLICIT_KEY]: boolean })[
      TENANT_IS_IMPLICIT_KEY
    ] = false;

    const current = this.context.current();
    if (current) {
      (current as { tenantId: string }).tenantId = tenant.id;
    }
  }
}
