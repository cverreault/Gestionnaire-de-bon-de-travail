import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { resolveClientIp } from '../../../common/contracts/client-ip.contract';

export type LoginEventKind = 'LOGIN' | 'LOGIN_2FA' | 'FAILED' | 'LOGOUT';

export interface RequestMeta {
  ip: string | null;
  /** B63 — private address behind the reported public one. */
  lanIp: string | null;
  userAgent: string | null;
  deviceId: string | null;
}

/** Online = seen within this window. */
export const ONLINE_WINDOW_MS = 5 * 60_000;
const PRESENCE_WRITE_INTERVAL_MS = 60_000;
const LOGIN_EVENTS_RETENTION_DAYS = 365;

/**
 * B51 — who connected (IP, device, when) and who is online right now.
 *   - `record()` writes a login_events row (success, 2FA success, failure, logout) ;
 *   - `touch()` refreshes users.last_seen_at / last_seen_ip on authenticated
 *     requests, at most once a minute per user (in-memory throttle) ;
 *   - queries for the admin page and the users list.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly lastWrite = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async record(input: { tenantId: string; userId: string | null; email: string; kind: LoginEventKind; family?: string | null } & RequestMeta): Promise<void> {
    try {
      await this.prisma.loginEvent.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          email: input.email.toLowerCase(),
          kind: input.kind,
          ip: input.ip,
          lanIp: input.lanIp,
          userAgent: input.userAgent?.slice(0, 300) ?? null,
          deviceId: input.deviceId,
          family: input.family ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`login event not recorded: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Presence heartbeat from the JWT guard — cheap, throttled, never throws. */
  touch(userId: string, ip: string | null, lanIp: string | null = null): void {
    const now = Date.now();
    const last = this.lastWrite.get(userId) ?? 0;
    if (now - last < PRESENCE_WRITE_INTERVAL_MS) return;
    this.lastWrite.set(userId, now);
    void this.prisma.user
      .updateMany({ where: { id: userId }, data: { lastSeenAt: new Date(now), lastSeenIp: ip, lastSeenLanIp: lanIp } })
      .catch((err: unknown) => this.logger.debug(`presence not updated: ${err instanceof Error ? err.message : String(err)}`));
  }

  /** Online state of every staff user of the tenant, with the start of the current session. */
  async presence(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, role: { not: 'CLIENT' } },
      select: { id: true, lastSeenAt: true, lastSeenIp: true, lastSeenLanIp: true },
    });
    const now = Date.now();
    // Live sessions : families with a token neither revoked nor expired ; session start = family's first token.
    const live = await this.prisma.refreshToken.findMany({
      where: { tenantId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { userId: true, family: true, deviceId: true },
    });
    const families = [...new Set(live.map((t) => t.family))];
    const starts = families.length
      ? await this.prisma.refreshToken.groupBy({ by: ['family', 'userId'], where: { family: { in: families } }, _min: { createdAt: true } })
      : [];
    const sessionsByUser = new Map<string, { since: Date; count: number; mobile: number }>();
    for (const s of starts) {
      const cur = sessionsByUser.get(s.userId);
      const since = s._min.createdAt as Date;
      const isMobile = live.some((t) => t.family === s.family && t.deviceId);
      if (!cur) sessionsByUser.set(s.userId, { since, count: 1, mobile: isMobile ? 1 : 0 });
      else sessionsByUser.set(s.userId, { since: since < cur.since ? since : cur.since, count: cur.count + 1, mobile: cur.mobile + (isMobile ? 1 : 0) });
    }
    return users.map((u) => {
      const s = sessionsByUser.get(u.id);
      const online = !!u.lastSeenAt && now - u.lastSeenAt.getTime() < ONLINE_WINDOW_MS;
      return {
        userId: u.id,
        online,
        lastSeenAt: u.lastSeenAt,
        lastSeenIp: u.lastSeenIp,
        lastSeenLanIp: u.lastSeenLanIp,
        sessionSince: s?.since ?? null,
        activeSessions: s?.count ?? 0,
        mobileSessions: s?.mobile ?? 0,
      };
    });
  }

  /** Active sessions (live refresh-token families) of one user, with the login that opened each. */
  async userSessions(tenantId: string, userId: string) {
    const live = await this.prisma.refreshToken.findMany({
      where: { tenantId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { family: true, deviceId: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const byFamily = new Map<string, typeof live[number]>();
    for (const t of live) if (!byFamily.has(t.family)) byFamily.set(t.family, t);
    const families = [...byFamily.keys()];
    const [starts, logins] = await Promise.all([
      families.length ? this.prisma.refreshToken.groupBy({ by: ['family'], where: { family: { in: families } }, _min: { createdAt: true } }) : Promise.resolve([]),
      families.length ? this.prisma.loginEvent.findMany({ where: { family: { in: families } }, select: { family: true, ip: true, lanIp: true, userAgent: true, deviceId: true, createdAt: true } }) : Promise.resolve([]),
    ]);
    const startBy = new Map(starts.map((s) => [s.family, s._min.createdAt as Date]));
    const loginBy = new Map(logins.map((l) => [l.family as string, l]));
    return families.map((f) => {
      const t = byFamily.get(f)!;
      const l = loginBy.get(f);
      return {
        family: f,
        startedAt: startBy.get(f) ?? t.createdAt,
        lastRefreshAt: t.createdAt,
        expiresAt: t.expiresAt,
        ip: l?.ip ?? t.ip,
        lanIp: l?.lanIp ?? null,
        userAgent: l?.userAgent ?? t.userAgent,
        deviceId: t.deviceId ?? l?.deviceId ?? null,
      };
    });
  }

  async history(tenantId: string, opts: { userId?: string; from?: Date; to?: Date; kind?: LoginEventKind; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const where = {
      tenantId,
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.from || opts.to ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.loginEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.loginEvent.count({ where }),
    ]);
    const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, role: true } }) : [];
    const userBy = new Map(users.map((u) => [u.id, u]));
    return {
      data: rows.map((r) => ({ ...r, user: r.userId ? userBy.get(r.userId) ?? null : null })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'login-events-cleanup' })
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - LOGIN_EVENTS_RETENTION_DAYS * 86_400_000);
    const r = await this.prisma.loginEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => ({ count: 0 }));
    if (r.count > 0) this.logger.log(`login events cleanup : ${r.count} row(s) older than ${LOGIN_EVENTS_RETENTION_DAYS} days removed`);
  }
}

/** Client IP + agent + device from an Express request (trust proxy is on in main.ts). */
export function requestMeta(req: { ip?: string; headers: Record<string, string | string[] | undefined> } | undefined): RequestMeta {
  if (!req) return { ip: null, lanIp: null, userAgent: null, deviceId: null };
  const ua = req.headers['user-agent'];
  const dev = req.headers['x-device-id'];
  const { ip, lanIp } = resolveClientIp(req);
  return {
    ip,
    lanIp,
    userAgent: (Array.isArray(ua) ? ua[0] : ua) ?? null,
    deviceId: (Array.isArray(dev) ? dev[0] : dev)?.toLowerCase() ?? null,
  };
}
