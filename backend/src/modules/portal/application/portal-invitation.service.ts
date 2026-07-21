import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ISystemConfigResolver,
  SYSTEM_CONFIG_RESOLVER,
} from '../../../common/contracts/system-config-resolver.contract';

/**
 * B21 — client-portal invitations.
 *
 * Flow :
 *   1. Admin clicks « Inviter au portail » on a client record →
 *      POST /portal/invitations { clientId, email? }.
 *   2. A User { role: CLIENT, clientId } is created (or reused) with a
 *      random unusable password.
 *   3. A one-shot token (raw → email, SHA-256 → DB, TTL 7 days) is
 *      issued; the `portal.invitation.issued` event carries the link and
 *      the notifications listener sends the email (console fallback).
 *   4. The client opens /portail/activation?token=… and sets a password
 *      → POST /portal/activate consumes the token.
 *
 * Revocation = PATCH /users/:id { isActive: false } (existing staff
 * endpoint) — the JWT strategy already rejects inactive users.
 */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class PortalInvitationService {
  private readonly logger = new Logger(PortalInvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(SYSTEM_CONFIG_RESOLVER)
    private readonly configs: ISystemConfigResolver,
  ) {}

  /**
   * Issue (or re-issue) a portal invitation for a client. Idempotent on
   * the user: an existing CLIENT account for the same client record is
   * reused and its previous tokens are invalidated (= "resend").
   */
  async invite(input: { clientId: string; email?: string }) {
    const client = await this.prisma.client.findUnique({
      where: { id: input.clientId },
    });
    if (!client) {
      throw new NotFoundException('Client introuvable');
    }

    const email = (input.email ?? client.email)?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException(
        "La fiche client n'a pas de courriel — fournissez-en un pour l'invitation.",
      );
    }

    // One email = one account per tenant. Reuse a CLIENT account tied to
    // this client; refuse to hijack a staff account or another client's.
    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (existing && existing.role !== Role.CLIENT) {
      throw new ConflictException(
        'Ce courriel appartient déjà à un compte membre du personnel.',
      );
    }
    if (existing && existing.clientId && existing.clientId !== client.id) {
      throw new ConflictException(
        'Ce courriel est déjà rattaché au portail d’un autre client.',
      );
    }

    const user =
      existing ??
      (await this.prisma.user.create({
        data: {
          email,
          firstName: client.firstName,
          lastName: client.lastName,
          role: Role.CLIENT,
          clientId: client.id,
          isActive: true,
          // Unusable until activation sets the real one.
          password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
        },
      }));

    // Make sure a reused account is active and linked (e.g. re-invite
    // after a revocation).
    if (existing && (!existing.isActive || !existing.clientId)) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { isActive: true, clientId: client.id },
      });
    }

    // Resend semantics: previous outstanding tokens die now.
    await this.prisma.portalInvitation.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const raw = randomBytes(32).toString('hex');
    const invitation = await this.prisma.portalInvitation.create({
      data: {
        clientId: client.id,
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const link = await this.buildLink(user.tenantId, raw);
    // B29 — the raw token lives in the link. Log it only in dev (no SMTP)
    // so it's greppable from the container logs; never in production.
    const smtpHost = await this.configs.resolve('smtp.host', 'SMTP_HOST');
    if (smtpHost) {
      this.logger.log(`📧 Portal invitation issued for client=${client.id}`);
    } else {
      this.logger.log(`📧 Portal invitation issued for client=${client.id} : ${link}`);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    });
    const clientName =
      client.companyName || `${client.firstName} ${client.lastName}`.trim();
    this.eventEmitter.emit('portal.invitation.issued', {
      email,
      link,
      clientName,
      tenantName: tenant?.name,
    });

    return {
      invitationId: invitation.id,
      email,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Consume an invitation token and set the portal user's password.
   *
   * Raw SQL on purpose: this is a @Public route, so the request tenant
   * context may be the DEFAULT fallback (IP / apex hostname) while the
   * invitation belongs to another tenant — the tenant-scope middleware
   * would silently filter the row out. The token itself is the trust
   * root here (same posture as JwtStrategy.validate).
   */
  async activate(rawToken: string, password: string) {
    const tokenHash = hashToken(rawToken);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string;
        expires_at: Date;
        consumed_at: Date | null;
      }>
    >(
      `SELECT id, user_id, expires_at, consumed_at
       FROM portal_invitations WHERE token_hash = $1 LIMIT 1`,
      tokenHash,
    );
    if (rows.length === 0) {
      throw new NotFoundException("Lien d'invitation invalide");
    }
    const row = rows[0];
    if (row.consumed_at) {
      throw new BadRequestException(
        'Lien déjà utilisé. Demandez une nouvelle invitation à votre fournisseur.',
      );
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new BadRequestException(
        'Lien expiré. Demandez une nouvelle invitation à votre fournisseur.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(
        `UPDATE portal_invitations SET consumed_at = now() WHERE id = $1`,
        row.id,
      ),
      this.prisma.$executeRawUnsafe(
        `UPDATE users SET password = $1, email_verified_at = now(), updated_at = now()
         WHERE id = $2`,
        passwordHash,
        row.user_id,
      ),
    ]);

    this.logger.log(`✅ Portal account activated for user=${row.user_id}`);
    return { activated: true };
  }

  private async buildLink(tenantId: string, rawToken: string): Promise<string> {
    const origin =
      (await this.configs.resolve('platform.origin', 'PLATFORM_ORIGIN')) ??
      'http://localhost:8088';
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    const suffix = tenant?.slug ? `&tenant=${tenant.slug}` : '';
    return `${origin}/portail/activation?token=${rawToken}${suffix}`;
  }
}
