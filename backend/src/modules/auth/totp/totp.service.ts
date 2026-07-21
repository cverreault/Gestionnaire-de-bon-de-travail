import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../../webhooks/application/secret-crypto';
import * as bcrypt from 'bcrypt';

/**
 * B14 — TOTP (RFC 6238) two-factor auth for Dispatch2Go users.
 *
 * ─ Flow ─
 *   1. `beginSetup(userId)` — generates a fresh base32 secret, ENCRYPTS
 *      it (AES-256-GCM via the reused webhook-signing helper), stores
 *      it on the user, but keeps `totpEnabled=false`. Returns the QR
 *      URL (otpauth://…) and 10 one-time backup codes shown ONCE.
 *   2. `enable(userId, code)` — user scans the QR into their authenticator
 *      app and submits the first 6-digit code. On success we flip
 *      `totpEnabled=true` — from now on login requires TOTP.
 *   3. `verify(userId, code)` — called during login. Accepts a live TOTP
 *      code OR any unused backup code (checked against SHA-256 hashes).
 *   4. `disable(userId, currentPasswordHash, code)` — requires re-entry
 *      of both the password AND a live TOTP code. Clears all fields.
 *
 * ─ Key encryption ─
 *   `totp_secret` is stored encrypted so a leaked DB dump can't be used
 *   to generate current codes. Same threat model as webhook signing
 *   secrets — see ADR-012.
 *
 * ─ Backup codes ─
 *   Ten 8-character alphanumeric codes generated at setup time. Each
 *   line hashed SHA-256 and stored space-separated in
 *   `totp_backup_codes_hash`. On successful redemption the used hash is
 *   removed from the string.
 */
@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);

  // B26 — per-user brute-force lock: after MAX_ATTEMPTS wrong codes, lock
  // for LOCKOUT_MS. A live TOTP is a 6-digit space; the per-IP throttle
  // alone (10/min) is not enough on its own.
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCKOUT_MS = 15 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async beginSetup(userId: string): Promise<{
    otpauthUrl: string;
    secret: string;
    backupCodes: string[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, totpEnabled: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.totpEnabled) {
      throw new BadRequestException(
        '2FA déjà activé. Désactivez-le d\'abord si vous voulez régénérer un secret.',
      );
    }
    const secret = new Secret({ size: 20 }).base32;
    const backupCodes = generateBackupCodes(10);
    const backupHashes = backupCodes.map((c) => sha256(c)).join(' ');

    const totp = new TOTP({
      issuer: 'Dispatch2Go',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: encryptSecret(secret),
        totpBackupCodesHash: backupHashes,
        // stays not-enabled until confirmed
      },
    });

    return {
      otpauthUrl: totp.toString(),
      secret, // shown once so the user can also copy-paste it into their app
      backupCodes,
    };
  }

  async enable(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        totpSecret: true,
        totpEnabled: true,
      },
    });
    if (!user || !user.totpSecret) {
      throw new BadRequestException(
        'Aucun setup 2FA en cours. Appelez /2fa/setup d\'abord.',
      );
    }
    if (user.totpEnabled) {
      throw new BadRequestException('2FA déjà activé');
    }
    const plaintextSecret = decryptSecret(user.totpSecret);
    const totp = new TOTP({
      issuer: 'Dispatch2Go',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(plaintextSecret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      throw new UnauthorizedException('Code TOTP invalide');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: true,
        totpEnabledAt: new Date(),
      },
    });
  }

  /**
   * Called during login after the password check succeeds. Accepts a live
   * TOTP code OR one of the user's unused backup codes.
   *
   * Returns true on success. Throws Unauthorized on failure.
   */
  async verify(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        totpSecret: true,
        totpEnabled: true,
        totpBackupCodesHash: true,
        totpFailedAttempts: true,
        totpLockedUntil: true,
      },
    });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException('2FA non configuré');
    }

    // B26 — refuse while locked.
    if (user.totpLockedUntil && user.totpLockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((user.totpLockedUntil.getTime() - Date.now()) / 60000);
      this.logger.warn(`2FA locked for user=${user.id} — ${mins} min remaining`);
      throw new UnauthorizedException(
        `Trop de tentatives 2FA. Réessayez dans ${mins} minute(s).`,
      );
    }

    // 1. Try as live TOTP code.
    const trimmed = code.trim().replace(/\s+/g, '');
    if (/^\d{6}$/.test(trimmed)) {
      const secret = decryptSecret(user.totpSecret);
      const totp = new TOTP({
        issuer: 'Dispatch2Go',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret),
      });
      if (totp.validate({ token: trimmed, window: 1 }) !== null) {
        await this.resetLock(user.id, user.totpFailedAttempts);
        return true;
      }
    }

    // 2. Try as backup code.
    if (user.totpBackupCodesHash) {
      const trimmedCode = trimmed.toUpperCase();
      const codeHash = sha256(trimmedCode);
      const hashes = user.totpBackupCodesHash.split(' ');
      if (hashes.includes(codeHash)) {
        const remaining = hashes.filter((h) => h !== codeHash).join(' ');
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            totpBackupCodesHash: remaining || null,
            totpFailedAttempts: 0,
            totpLockedUntil: null,
          },
        });
        this.logger.warn(
          `User ${user.email} redeemed a backup 2FA code (${hashes.length - 1} remaining).`,
        );
        return true;
      }
    }

    await this.registerFailure(user.id, user.totpFailedAttempts);
    throw new UnauthorizedException('Code TOTP ou de secours invalide');
  }

  /** Reset the brute-force counters after a successful verification. */
  private async resetLock(userId: string, current: number): Promise<void> {
    if (current === 0) return; // avoid a needless write on the happy path
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpFailedAttempts: 0, totpLockedUntil: null },
    });
  }

  /** Bump the failed-attempt counter and lock the account past the cap. */
  private async registerFailure(userId: string, current: number): Promise<void> {
    const attempts = current + 1;
    const locked = attempts >= TotpService.MAX_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: userId },
      // When locking, reset the counter and stamp the window; otherwise
      // only bump the counter (leave totpLockedUntil untouched).
      data: locked
        ? {
            totpFailedAttempts: 0,
            totpLockedUntil: new Date(Date.now() + TotpService.LOCKOUT_MS),
          }
        : { totpFailedAttempts: attempts },
    });
    if (locked) {
      this.logger.warn(
        `2FA locked for user=${userId} after ${attempts} failed attempts (${TotpService.LOCKOUT_MS / 60000} min).`,
      );
    }
  }

  /**
   * Disable 2FA. Requires the user's current password AND a valid TOTP or
   * backup code so a stolen JWT alone can't turn 2FA off.
   */
  async disable(
    userId: string,
    currentPassword: string,
    code: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password: true,
        totpEnabled: true,
        totpSecret: true,
        totpBackupCodesHash: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!user.totpEnabled) throw new BadRequestException('2FA non activé');

    const passwordOk = await bcrypt.compare(currentPassword, user.password);
    if (!passwordOk) throw new ForbiddenException('Mot de passe incorrect');

    // verify() throws if code is invalid — we let it bubble.
    await this.verify(userId, code);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodesHash: null,
        totpEnabledAt: null,
      },
    });
  }

  /**
   * Read-only check — used by the login controller to know whether to ask
   * for a 2FA code after the password check.
   */
  async isEnabledForUser(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabled: true },
    });
    return !!user?.totpEnabled;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Generate `count` random 8-char uppercase alphanumeric backup codes.
 * Ambiguous chars (0/O, 1/I) are avoided.
 */
function generateBackupCodes(count: number): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let code = '';
    for (let j = 0; j < 8; j++) {
      code += alphabet[bytes[j] % alphabet.length];
    }
    // Insert a dash in the middle for readability: XXXX-XXXX
    out.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return out;
}
