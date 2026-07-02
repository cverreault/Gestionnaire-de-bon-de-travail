import { Throttle } from '@nestjs/throttler';

/**
 * Higher rate-limit buckets for the public API v1 (B8).
 *
 * The internal UI's global defaults (20 req/s, 100/10s, 300/min) target
 * a single human clicking through the app. Machine callers legitimately
 * need more headroom :
 *   - 30 req/s   — burst ceiling
 *   - 300 req/10s — sustained
 *   - 3 000 req/min — hourly rate ≈ 180 000 (plenty for any reasonable
 *     integration; abusive traffic still trips the shorter buckets).
 *
 * Values are read from env once at module load so an operator can dial
 * them up per deployment without rebuilding the image. The `PUBLIC_API_
 * THROTTLE_*` names let deployment configs surface the intent clearly.
 */
const SHORT_LIMIT = Number.parseInt(process.env.PUBLIC_API_THROTTLE_SHORT ?? '30', 10);
const MEDIUM_LIMIT = Number.parseInt(process.env.PUBLIC_API_THROTTLE_MEDIUM ?? '300', 10);
const LONG_LIMIT = Number.parseInt(process.env.PUBLIC_API_THROTTLE_LONG ?? '3000', 10);

/**
 * Applies the public-API throttle profile to a controller or method.
 * Uses the same three named buckets as the global config so the
 * `UserScopedThrottlerGuard` (registered as APP_GUARD) tracks all three
 * with the higher limits.
 */
export const PublicApiThrottle = (): ClassDecorator & MethodDecorator =>
  Throttle({
    short: { limit: SHORT_LIMIT, ttl: 1000 },
    medium: { limit: MEDIUM_LIMIT, ttl: 10000 },
    long: { limit: LONG_LIMIT, ttl: 60000 },
  });
