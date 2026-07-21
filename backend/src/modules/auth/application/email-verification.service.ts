import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ISystemConfigResolver,
  SYSTEM_CONFIG_RESOLVER,
} from '../../../common/contracts/system-config-resolver.contract';

/**
 * Email verification (B6.8) — soft enforcement.
 *
 * Flow :
 *   1. SignupService calls issueToken(userId, slug) right after
 *      creating the new ADMIN user.
 *   2. The raw token is mailed to the user with a link to
 *      https://<slug>.taskmgr.com/verify-email?token=<raw>
 *   3. The user clicks the link → POST /auth/verify-email { token }
 *      sets emailVerifiedAt on the user and consumes the row.
 *
 * The account works whether or not the user clicks. Only the
 * "vérifie ton email" banner persists.
 *
 * Token storage : SHA-256 of the raw value (same posture as
 * RefreshToken). Lifetime : 7 days. Expired/consumed tokens → 400.
 */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYSTEM_CONFIG_RESOLVER)
    private readonly configs: ISystemConfigResolver,
  ) {}

  /**
   * Generate a fresh verification token + persist its hash + log the
   * outgoing link (the actual email send is wired to the EmailChannel
   * by the listener — out of scope for B6.8, we don't want to couple
   * tenants → notifications directly).
   *
   * Returns the raw token so the caller (signup / resend handlers)
   * can include it in the email payload.
   */
  async issueToken(userId: string, slug: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.prisma.emailVerification.create({
      data: { userId, tokenHash, expiresAt },
    });

    // B29 — the raw token lives in the link. Only log the full link when
    // SMTP is NOT configured (dev / console-fallback mode) so a developer
    // can grab it from the container logs; in production log the user id
    // only, never the token.
    const link = await this.buildLink(slug, raw);
    const smtpHost = await this.configs.resolve('smtp.host', 'SMTP_HOST');
    if (smtpHost) {
      this.logger.log(`📧 Verification link issued for user=${userId}`);
    } else {
      this.logger.log(`📧 Verification link issued for user=${userId} : ${link}`);
    }
    return raw;
  }

  /**
   * Consume a token. Sets emailVerifiedAt on the user.
   *
   *   - Unknown / wrong hash → 404 (no info leak)
   *   - Expired → 400 with a clear message
   *   - Already consumed → 400 (defence-in-depth ; the row is
   *     usually deleted on consume but we keep the check)
   */
  async verify(rawToken: string): Promise<{ userId: string }> {
    const tokenHash = hashToken(rawToken);
    const row = await this.prisma.emailVerification.findUnique({
      where: { tokenHash },
    });
    if (!row) {
      throw new NotFoundException('Lien de vérification invalide');
    }
    if (row.consumedAt) {
      throw new BadRequestException(
        'Lien déjà utilisé. Si votre adresse n\'est pas vérifiée, demandez un nouveau lien.',
      );
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Lien expiré. Demandez un nouveau lien depuis votre profil.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    this.logger.log(`✅ Email verified for user=${row.userId}`);
    return { userId: row.userId };
  }

  /**
   * Builds the user-facing verification URL. Reads the public origin
   * from system_configs (`platform.origin` — set by SA) or falls back
   * to a localhost dev origin so the dev flow logs a clickable link
   * without configuration.
   */
  private async buildLink(slug: string, rawToken: string): Promise<string> {
    const origin =
      (await this.configs.resolve('platform.origin', 'PLATFORM_ORIGIN')) ??
      'http://localhost:8088';
    // For dev (single hostname), slug is encoded in the query string.
    // For prod (wildcard), it lives in the sub-domain — same path.
    return `${origin}/verify-email?token=${rawToken}&tenant=${slug}`;
  }
}
