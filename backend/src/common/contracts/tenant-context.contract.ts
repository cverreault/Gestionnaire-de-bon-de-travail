/**
 * Tenant context contract (B6.2).
 *
 * Lives in common/contracts/ because every business module depends on
 * it (via the @CurrentTenant() decorator or AsyncLocalStorage in B6.3)
 * but neither owns it. Tenant model + middleware live in the
 * `tenants` module that B6.10 introduces.
 *
 * Shape kept narrow — only the fields a downstream handler / service
 * actually needs to make a decision. The full Tenant row from Prisma
 * is available via the request when needed.
 */

/** DI / request key the middleware uses. */
export const TENANT_REQUEST_KEY = 'tenant' as const;

/**
 * Request key for "was this tenant inferred from the URL or fallback?".
 *
 * `true`  → no slug derivable (IP / localhost / apex / reserved sub) — the
 *           resolver used DEFAULT as a permissive placeholder, and the
 *           JwtAuthGuard is allowed to swap it for the JWT's tenantId
 *           (this is how IP-based self-hosted impersonation works).
 * `false` → a subdomain pinned a specific tenant — the guard MUST enforce
 *           `JWT.tenantId === request.tenant.id` (anti-spoofing).
 */
export const TENANT_IS_IMPLICIT_KEY = 'tenantIsImplicit' as const;

/** Subdomain reserved for the login UI — bypasses tenant resolution. */
export const TENANT_AUTH_SUBDOMAIN = 'auth' as const;

/** Subdomains reserved for operator / marketing pages. */
export const TENANT_RESERVED_SUBDOMAINS = new Set<string>([
  TENANT_AUTH_SUBDOMAIN,
  'www',
  'api',
  'static',
  'cdn',
  'docs',
]);

/** Stable UUID of the DEFAULT tenant used for self-hosted backfill. */
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001' as const;
export const DEFAULT_TENANT_SLUG = 'default' as const;

export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

/**
 * Extracts the tenant slug from a Host header.
 *
 * Rules :
 *   - "myclient.taskmgr.com" → "myclient"
 *   - "myclient.taskmgr.local:8088" → "myclient"
 *   - "localhost" / "127.0.0.1" / "::1" → null (caller should fall back to DEFAULT)
 *   - apex "taskmgr.com" → null (no subdomain — marketing / signup UI)
 *   - reserved subdomain (auth, www, …) → null (bypass)
 *
 * Returns null when no tenant slug can be derived. Caller decides what
 * to do (use DEFAULT, return 404, etc.).
 */
export function extractTenantSlug(host: string | undefined): string | null {
  if (!host) return null;
  const hostNoPort = host.split(':')[0].toLowerCase();

  // Loopback addresses + bare IPs: no subdomain to extract.
  if (
    hostNoPort === 'localhost' ||
    hostNoPort === '127.0.0.1' ||
    hostNoPort === '::1' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostNoPort)
  ) {
    return null;
  }

  const segments = hostNoPort.split('.');
  // Apex domain (taskmgr.com) — no subdomain.
  if (segments.length < 3) return null;

  const candidate = segments[0];
  if (TENANT_RESERVED_SUBDOMAINS.has(candidate)) return null;
  return candidate;
}
