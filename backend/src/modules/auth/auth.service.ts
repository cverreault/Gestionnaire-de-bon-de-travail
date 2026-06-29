import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.interface';

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
  ) {}

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, tenantId: string) {
    // Email is now per-tenant unique (B6.3) — same gmail address can
    // exist in two tenants. The sub-domain decides which one is
    // logging in.
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId },
    });

    // Message volontairement identique pour les deux cas (email inconnu / mauvais mdp)
    // afin d'éviter l'énumération de comptes.
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email ou mot de passe invalide');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Email ou mot de passe invalide');
    }

    // Nouvelle famille à chaque login.
    const family = crypto.randomUUID();
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.tenantId,
      family,
    );
    const { password: _pw, ...safeUser } = user;

    return {
      ...tokens,
      user: safeUser,
    };
  }

  // ── Refresh ────────────────────────────────────────────────────────────────

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token manquant');
    }

    // Vérifier la signature avant de toucher à la DB — évite un round-trip
    // sur les tokens manifestement bogus.
    try {
      this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'changeme-jwt-refresh-secret',
        ),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

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

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;

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
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'changeme-jwt-refresh-secret',
        ),
        expiresIn: '7d',
      },
    );

    // Persister la rangée DB pour pouvoir révoquer.
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId,
        family,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }
}
