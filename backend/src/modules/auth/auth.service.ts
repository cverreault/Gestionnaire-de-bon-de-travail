import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
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

@Injectable()
export class AuthService {
  /**
   * Store MVP en mémoire : Map<refreshToken, userId>.
   * Sera remplacé par une table DB (RefreshToken) en V2.
   */
  private readonly refreshTokenStore = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
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

    const tokens = await this.generateTokens(user.id, user.email, user.role);
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

    const userId = this.refreshTokenStore.get(refreshToken);
    if (!userId) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    // Vérifier la signature JWT du refresh token
    try {
      this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'changeme-jwt-refresh-secret',
        ),
      });
    } catch {
      this.refreshTokenStore.delete(refreshToken);
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      this.refreshTokenStore.delete(refreshToken);
      throw new UnauthorizedException('Utilisateur introuvable ou désactivé');
    }

    // Rotation : on invalide l'ancien refresh token avant d'en émettre un nouveau
    this.refreshTokenStore.delete(refreshToken);

    return this.generateTokens(user.id, user.email, user.role);
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  async logout(refreshToken: string): Promise<void> {
    if (refreshToken) {
      this.refreshTokenStore.delete(refreshToken);
    }
  }

  // ── Register (Admin only — appelé depuis UsersModule) ──────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
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

  private async generateTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload);
    // Le refresh token utilise un secret distinct et une durée de vie plus longue
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>(
        'JWT_REFRESH_SECRET',
        'changeme-jwt-refresh-secret',
      ),
      expiresIn: '7d',
    });

    this.refreshTokenStore.set(refreshToken, userId);

    return { accessToken, refreshToken };
  }
}
