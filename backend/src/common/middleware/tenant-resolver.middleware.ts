import {
  Injectable,
  Logger,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import {
  DEFAULT_TENANT_ID,
  TENANT_IS_IMPLICIT_KEY,
  TENANT_REQUEST_KEY,
  TenantContext,
  extractTenantSlug,
} from '../contracts/tenant-context.contract';
import { DEVICE_ID_HEADER, extractDeviceId } from '../contracts/device-context.contract';
import { CLIENT_LOCATION_HEADER, parseClientLocation } from '../contracts/client-location.contract';

/**
 * TenantResolver — runs at the head of every HTTP request (B6.2).
 *
 * Pipeline :
 *   1. Read Host header → derive a tenant slug
 *   2. If a slug is derivable: look up the Tenant row by slug
 *   3. Attach the row to `request.tenant` (TENANT_REQUEST_KEY)
 *   4. If no slug derivable (localhost, apex, reserved subdomain),
 *      attach the DEFAULT tenant — keeps the self-hosted dev flow alive
 *
 * Unknown slugs → 404 (deliberately not 401/403 — no information leak
 * about whether a tenant exists).
 *
 * Inactive tenants → 404 too. SA reactivates from /super-admin/tenants
 * (B6.10).
 *
 * The actual cross-tenant access check (JWT.tenantId === request.tenant.id)
 * lives in JwtAuthGuard, after this middleware sets up the context. B6.3
 * wires the assertion.
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  /** B59 — short TTL so a changed setting (time zone) is picked up without restart. */
  private cache = new Map<string, { tenant: TenantContext; at: number }>();
  private static readonly CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = extractTenantSlug(req.headers.host);
    const lookupSlug = slug ?? 'default';

    const cached = this.cache.get(lookupSlug);
    let tenant = cached && Date.now() - cached.at < TenantResolverMiddleware.CACHE_TTL_MS ? cached.tenant : undefined;
    if (!tenant) {
      const row = await this.prisma.tenant.findUnique({
        where: { slug: lookupSlug },
        select: { id: true, slug: true, name: true, isActive: true, timezone: true },
      });

      if (!row) {
        // Slug derived but no matching tenant → 404, no enumeration.
        if (slug) {
          throw new NotFoundException(
            `Aucun espace de travail à cette adresse (${req.headers.host})`,
          );
        }
        // Fallback path — the DEFAULT tenant is missing. This means
        // the Genesis migration didn't run; we should bail loudly
        // rather than silently misroute requests.
        this.logger.error(
          'DEFAULT tenant missing from the database — Genesis migration not applied?',
        );
        throw new NotFoundException('Tenant DEFAULT introuvable');
      }
      tenant = row;
      this.cache.set(lookupSlug, { tenant, at: Date.now() });
    }

    if (!tenant.isActive) {
      throw new NotFoundException(
        'Cet espace de travail est désactivé. Contactez l\'administrateur.',
      );
    }

    // Attach for downstream guards / controllers.
    (req as Request & { [TENANT_REQUEST_KEY]: TenantContext })[
      TENANT_REQUEST_KEY
    ] = tenant;

    // Flag whether this tenant was inferred from the URL (slug) or is a
    // permissive DEFAULT fallback (IP / localhost / apex). The JwtAuthGuard
    // uses this to decide between strict anti-spoofing (slug→tenant) and
    // "trust the JWT" (no slug → admin tooling / self-hosted IP access).
    (req as Request & { [TENANT_IS_IMPLICIT_KEY]: boolean })[
      TENANT_IS_IMPLICIT_KEY
    ] = slug === null;

    // Open the AsyncLocalStorage scope so deep services can read the
    // tenant without threading it through every signature. userId is
    // filled in later by JwtAuthGuard — start as null.
    // B37.3 — the mobile app tags every request with its installation id so
    // auth can bind refresh tokens to the device (ADR-015 §4).
    const deviceId = extractDeviceId(req.headers[DEVICE_ID_HEADER]);
    // B45 — position of the client at the time of the action, for the audit trail.
    const clientLocation = parseClientLocation(req.headers[CLIENT_LOCATION_HEADER]);
    this.context.run({ tenantId: tenant.id, userId: null, deviceId, clientLocation, timezone: tenant.timezone }, () => next());
  }

  /** Test-only — wipe the slug→tenant cache. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Test-only — pre-warm the cache (mostly for spec isolation). */
  primeCache(slug: string, tenant: TenantContext): void {
    this.cache.set(slug, { tenant, at: Date.now() });
  }

  /** Stable export for handlers that need it. */
  static defaultTenantId(): string {
    return DEFAULT_TENANT_ID;
  }
}
