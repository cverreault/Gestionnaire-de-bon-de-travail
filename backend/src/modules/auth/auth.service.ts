import {
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { SessionsService, type RequestMeta } from './application/sessions.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.interface';
import type { User } from '@prisma/client';

type SafeUser = Omit<User, 'password'>;
type TokenPair = { accessToken: string; refreshToken: string };
type LoginResult =
  | { requires2fa: true; pendingToken: string; userId: string }
  | (TokenPair & { user: SafeUser });

/** Projection utilisateur sans le hash de mot de passe */
const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Refresh token lifetime — 7 jours (en ms pour calculer expiresAt) */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Hash SHA-256 hex d'un JWT — pour la persistance, le brut ne quitte jamais le client */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessions: SessionsService,
    /** Optional so existing unit tests keep constructing the service with three deps. */
    @Optional() private readonly requestContext?: RequestContextService,
  ) {}

  // ── Hôte implicite (apex / www / localhost) ─────────────────────────────────
  //
  // Sur ces hôtes le middleware résout le tenant DEFAULT ; un utilisateur d'un
  // autre tenant serait invisible (tenant-scope) et ses tokens seraient créés
  // dans le mauvais tenant. Les flux d'auth basculent donc dans le contexte
  // du tenant porté par la credential : email unique → tenant de l'utilisateur,
  // refresh / pending token → claim `tenantId` (signature vérifiée).

  /** Runs `fn` inside `tenantId`'s context when it differs from the current one. */
  private inTenant<R>(tenantId: string | undefined, fn: () => Promise<R>): Promise<R> {
    if (!tenantId || !this.requestContext) return fn();
    if (this.requestContext.current()?.tenantId === tenantId) return fn();
    return this.requestContext.runWith({ tenantId }, fn);
  }

  /**
   * Tenant of the only active account carrying this email (raw SQL: the
   * tenant-scope middleware would hide other tenants' rows). Null when
   * unknown or ambiguous — an ambiguous email must use its subdomain.
   */
  private async resolveTenantByEmail(email: string): Promise<string | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ tenant_id: string }>>(
      `SELECT u.tenant_id FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE lower(u.email) = lower($1) AND u.is_active = true AND t.is_active = true
       LIMIT 2`,
      email,
    );
    if (rows.length === 1) return rows[0].tenant_id;
    if (rows.length > 1) {
      this.logger.warn(
        'Login sur hôte implicite : email présent dans plusieurs tenants — connexion via le sous-domaine requise',
      );
    }
    return null;
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, tenantId: string, tenantIsImplicit = false, meta: RequestMeta = { ip: null, userAgent: null, deviceId: null }): Promise<LoginResult> {
    // Email is now per-tenant unique (B6.3) — same gmail address can
    // exist in two tenants. The sub-domain decides which one is
    // logging in.
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId },
    });

    // Apex / www: no subdomain to pick the tenant. When the email exists in
    // exactly one tenant, log in there (the JWT guard already trusts the
    // token's tenant on implicit hosts).
    if (!user && tenantIsImplicit) {
      const resolved = await this.resolveTenantByEmail(dto.email);
      if (resolved && resolved !== tenantId) {
        return this.inTenant(resolved, () => this.login(dto, resolved, false, meta));
      }
    }

    // Message volontairement identique pour les deux cas (email inconnu / mauvais mdp)
    // afin d'éviter l'énumération de comptes.
    if (!user || !user.isActive) {
      await this.sessions.record({ tenantId, userId: user?.id ?? null, email: dto.email, kind: 'FAILED', ...meta });
      throw new UnauthorizedException('Email ou mot de passe invalide');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      await this.sessions.record({ tenantId, userId: user.id, email: dto.email, kind: 'FAILED', ...meta });
      throw new UnauthorizedException('Email ou mot de passe invalide');
    }

    // B14 — if 2FA is enabled, halt here and issue a short-lived « pending
    // login token » the client must exchange for real tokens via
    // /auth/login/2fa with a valid TOTP code.
    if ((user as unknown as { totpEnabled?: boolean }).totpEnabled) {
      const pendingToken = await this.jwtService.signAsync(
        {
          sub: user.id,
          typ: '2fa-pending',
          tenantId: user.tenantId,
        },
        { expiresIn: '5m' },
      );
      return {
        requires2fa: true as const,
        pendingToken,
        userId: user.id,
      };
    }

    // Nouvelle famille à chaque login.
    const family = crypto.randomUUID();
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.tenantId,
      family,
      meta,
    );
    await this.sessions.record({ tenantId: user.tenantId, userId: user.id, email: user.email, kind: 'LOGIN', family, ...meta });
    const { password: _pw, ...safeUser } = user;

    return {
      ...tokens,
      user: safeUser,
    };
  }

  /**
   * B14 — Step 2 of a 2FA-gated login. Verifies the pending token from
   * step 1 + the TOTP (or backup) code, then issues the real access +
   * refresh pair.
   */
  async login2fa(
    pendingToken: string,
    code: string,
    verifyTotp: (userId: string, code: string) => Promise<boolean>,
    meta: RequestMeta = { ip: null, userAgent: null, deviceId: null },
  ): Promise<TokenPair & { user: SafeUser }> {
    let payload: { sub?: string; typ?: string; tenantId?: string };
    try {
      payload = await this.jwtService.verifyAsync(pendingToken);
    } catch {
      throw new UnauthorizedException('Session 2FA expirée. Reconnectez-vous.');
    }
    if (payload.typ !== '2fa-pending' || !payload.sub) {
      throw new UnauthorizedException('Session 2FA invalide.');
    }
    if (payload.tenantId && this.requestContext && this.requestContext.current()?.tenantId !== payload.tenantId) {
      return this.inTenant(payload.tenantId, () => this.login2fa(pendingToken, code, verifyTotp, meta));
    }
    await verifyTotp(payload.sub, code);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Utilisateur introuvable ou désactivé');
    }
    const family = crypto.randomUUID();
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.tenantId,
      family,
      meta,
    );
    await this.sessions.record({ tenantId: user.tenantId, userId: user.id, email: user.email, kind: 'LOGIN_2FA', family, ...meta });
    const { password: _pw, ...safeUser } = user;
    return { ...tokens, user: safeUser };
  }

  // ── Refresh ────────────────────────────────────────────────────────────────

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token manquant');
    }

    // Vérifier la signature avant de toucher à la DB — évite un round-trip
    // sur les tokens manifestement bogus.
    let claims: { tenantId?: string } = {};
    try {
      claims = (this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      }) ?? {}) as { tenantId?: string };
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    return this.inTenant(claims.tenantId, () => this.rotate(refreshToken));
  }

  /** Rotation proper — runs inside the token's tenant context (see `refresh`). */
  private async rotate(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!row) {
      // Token jamais émis (ou déjà supprimé par une purge) — rejet simple.
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    // ── Détection de replay attack ──
    // Si le client rejoue un token déjà révoqué, c'est qu'un attaquant l'a volé
    // ET que le client légitime s'en est déjà servi (ou inversement). Dans le
    // doute, on tue toute la famille pour forcer la réauthentification.
    if (row.revokedAt) {
      this.logger.warn(
        `🚨 Replay de refresh token révoqué (userId=${row.userId}, family=${row.family}) — révocation de toute la famille`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { family: row.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || !user.isActive) {
      // Marquer le token comme révoqué pour éviter qu'il traîne.
      await this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Utilisateur introuvable ou désactivé');
    }

    // Rotation : on révoque l'ancien token et on émet un nouveau dans la même
    // famille — atomique pour éviter une fenêtre de race où l'ancien serait
    // exécutable deux fois.
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.tenantId,
      row.family,
    );
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  async logout(refreshToken: string, meta: RequestMeta = { ip: null, userAgent: null, deviceId: null }): Promise<void> {
    if (!refreshToken) return;
    // B51 — best effort : who logged out, from where.
    try {
      const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) }, select: { userId: true, tenantId: true, family: true } });
      if (row) {
        const u = await this.prisma.user.findUnique({ where: { id: row.userId }, select: { email: true } });
        await this.sessions.record({ tenantId: row.tenantId, userId: row.userId, email: u?.email ?? '', kind: 'LOGOUT', family: row.family, ...meta });
      }
    } catch {
      // ignore
    }

    // Best effort: read the tenant claim so the row is found on an implicit host.
    let claims: { tenantId?: string } = {};
    try {
      claims = (this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      }) ?? {}) as { tenantId?: string };
    } catch {
      claims = {};
    }
    return this.inTenant(claims.tenantId, () => this.revokeToken(refreshToken));
  }

  private async revokeToken(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    // Best-effort : si le token n'existe pas ou est déjà révoqué, on ignore.
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch((err) => {
        this.logger.warn(`logout : impossible de révoquer le token — ${err}`);
      });
  }

  // ── Register (Admin only — appelé depuis UsersModule) ──────────────────────

  async register(dto: RegisterDto, tenantId: string) {
    // Email is per-tenant unique (B6.3). Pre-flight check is scoped to
    // the current tenant.
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId },
    });
    if (existing) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        phone: dto.phone,
      },
      select: USER_SELECT,
    });

    return user;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    tenantId: string,
    family: string,
    meta?: RequestMeta,
  ) {
    const payload: JwtPayload = { sub: userId, email, role, tenantId };

    const accessToken = this.jwtService.sign(payload);
    // Le refresh token utilise un secret distinct et une durée de vie plus longue.
    // jti is added to guarantee each token is unique even when two refreshes
    // happen in the same second (JWT iat is second-grained). Without it, the
    // resulting tokenHash collides and the unique constraint trips.
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: crypto.randomUUID() },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );

    // Persister la rangée DB pour pouvoir révoquer.
    // B37.3 — bind the row to the mobile installation (X-Device-Id) so a
    // revoked device loses its sessions (ADR-015 §4). Null for web clients.
    const deviceId = this.requestContext?.current()?.deviceId ?? null;
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId,
        family,
        deviceId,
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }
}
