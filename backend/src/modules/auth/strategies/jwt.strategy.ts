import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtPayload } from '../types/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'changeme-jwt-secret'),
    });
  }

  /**
   * Appelé automatiquement par Passport après validation de la signature JWT.
   * L'objet retourné est attaché à `request.user`.
   */
  async validate(payload: JwtPayload) {
    // Raw SQL : the tenant-scope middleware (B6.4) auto-filters
    // `prisma.user.findUnique` by the request's active tenantId. That
    // breaks cross-tenant flows the auth layer legitimately needs —
    // SA impersonation issues a token for a user in tenant X, but the
    // request might come in via IP/localhost where the resolver falls
    // back to DEFAULT. The middleware would then return null and we'd
    // 401 a perfectly valid token. The JWT signature is the trust root
    // here, not the request scope.
    type Row = {
      id: string;
      tenant_id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: import('@prisma/client').Role;
      is_active: boolean;
      phone: string | null;
      client_id: string | null;
      created_at: Date;
      updated_at: Date;
    };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, tenant_id, email, first_name, last_name, role,
              is_active, phone, client_id, created_at, updated_at
       FROM users WHERE id = $1 LIMIT 1`,
      payload.sub,
    );

    if (rows.length === 0 || !rows[0].is_active) {
      throw new UnauthorizedException('Utilisateur introuvable ou désactivé');
    }
    const r = rows[0];

    // Defence-in-depth: the JWT claim must match the user's DB row.
    // A revoked-then-reissued token from a moved user would otherwise
    // carry the old tenantId.
    if (payload.tenantId && r.tenant_id !== payload.tenantId) {
      throw new UnauthorizedException(
        'Token incompatible avec le compte utilisateur',
      );
    }

    return {
      id: r.id,
      tenantId: r.tenant_id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      role: r.role,
      isActive: r.is_active,
      phone: r.phone,
      clientId: r.client_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
