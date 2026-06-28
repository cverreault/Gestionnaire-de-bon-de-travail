import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate-limit per authenticated user when possible, fall back to IP.
 *
 * The default ThrottlerGuard buckets by client IP, which breaks down behind
 * NAT/CGNAT (a whole household or office shares one IP) and over-blocks
 * legitimate users when one user floods. Once the JwtAuthGuard has populated
 * `req.user`, this guard switches the throttler tracker to the user id —
 * a flooding tech only throttles themselves, not their colleagues.
 *
 * Anonymous endpoints (login, refresh, swagger) keep the IP tracker as a
 * brute-force defence. ADR-001 §3 and security audit §E6 (plan.md).
 */
@Injectable()
export class UserScopedThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as Request & { user?: { id?: string } }).user;
    if (user?.id) return `user:${user.id}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
