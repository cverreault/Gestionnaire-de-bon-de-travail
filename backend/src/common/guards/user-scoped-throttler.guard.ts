import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { ResolvedApiKey } from '../../modules/api-keys/api-keys.service';

/**
 * Rate-limit per authenticated caller — API key, then JWT user, then IP.
 *
 * The default ThrottlerGuard buckets by client IP, which breaks down behind
 * NAT/CGNAT (a whole household or office shares one IP) and over-blocks
 * legitimate users when one user floods.
 *
 * Priority :
 *   1. `req.apiKey.id` — public API v1 calls carry an API key; buckets are
 *      isolated per integration so a flooding CRM doesn't throttle the
 *      customer's dashboard.
 *   2. `req.user.id` — internal UI calls after JwtAuthGuard has populated
 *      the user.
 *   3. IP — anonymous endpoints (login, refresh, swagger). Brute-force
 *      defence only.
 *
 * ADR-001 §3, ADR-011 §Consequences.
 */
@Injectable()
export class UserScopedThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const apiKey = (req as Request & { apiKey?: ResolvedApiKey }).apiKey;
    if (apiKey?.id) return `apiKey:${apiKey.id}`;
    const user = (req as Request & { user?: { id?: string } }).user;
    if (user?.id) return `user:${user.id}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
