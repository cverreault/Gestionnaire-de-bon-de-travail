import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { USER_SESSIONS_REVOKED_EVENT, type UserSessionsRevokedPayload, type UserSessionsRevokedResult } from '../../common/contracts/user-events.contract';
import {
  IQuotaService,
  QUOTA_SERVICE,
  QuotaType,
} from '../../common/contracts/quota.contract';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';

/** Projection partagée — exclut systématiquement le hash de mot de passe */
const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  phone: true,
  locationRequired: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUOTA_SERVICE)
    private readonly quotas: IQuotaService,
    private readonly context: RequestContextService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Sessions ───────────────────────────────────────────────────────────────

  /**
   * Cuts every session of a user : refresh tokens (web + mobile) and
   * registered mobile devices, through `users.user.sessionsRevoked`
   * consumed by `auth` and `mobile`. Access tokens already issued stay
   * valid until they expire (15 min). Returns the counts reported by the
   * listeners.
   */
  async revokeSessions(
    userId: string,
    actorUserId: string | null,
    reason: UserSessionsRevokedPayload['reason'] = 'admin',
  ): Promise<{ refreshTokens: number; devices: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, tenantId: true } });
    if (!user) throw new NotFoundException(`Utilisateur #${userId} introuvable`);
    const payload: UserSessionsRevokedPayload = { tenantId: user.tenantId, userId: user.id, actorUserId, reason };
    const results = (await this.events.emitAsync(USER_SESSIONS_REVOKED_EVENT, payload)) as Array<UserSessionsRevokedResult | undefined>;
    const totals = { refreshTokens: 0, devices: 0 };
    for (const r of results) {
      totals.refreshTokens += r?.refreshTokens ?? 0;
      totals.devices += r?.devices ?? 0;
    }
    return totals;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async findAll(role?: Role) {
    return this.prisma.user.findMany({
      // B21 — portal accounts (role CLIENT) are managed from the client
      // record, not the staff Users page: hide them unless explicitly asked.
      where: role ? { role } : { role: { not: Role.CLIENT } },
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`Utilisateur #${id} introuvable`);
    }

    return user;
  }

  async findActiveTechnicians() {
    return this.prisma.user.findMany({
      where: { role: Role.TECHNICIAN, isActive: true },
      select: USER_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  async create(dto: CreateUserDto) {
    // Email is per-tenant unique (B6.3). findFirst scoped via the
    // tenant filter automatically injected by Prisma $extends (B6.4).
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    // Quota check (B6.6) — atomic increment of tenant.current_users.
    // ForbiddenException with French message when the ceiling is hit.
    const tenantId = this.context.current()?.tenantId;
    if (tenantId) {
      await this.quotas.checkAndConsume(QuotaType.USERS, tenantId);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
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
  }

  async update(id: string, dto: UpdateUserDto) {
    // S'assure que l'utilisateur existe
    await this.findOne(id);

    if (dto.email) {
      const emailTaken = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (emailTaken) {
        throw new ConflictException('Cet email est déjà utilisé par un autre compte');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });
    // Deactivating = logging out everywhere (refresh tokens + mobile devices).
    if (dto.isActive === false) await this.revokeSessions(id, this.context.current()?.userId ?? null, 'deactivated');
    return updated;
  }

  /** Soft delete : met isActive à false sans supprimer la ligne. */
  async remove(id: string) {
    await this.findOne(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
    await this.revokeSessions(id, this.context.current()?.userId ?? null, 'deactivated');
    return updated;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: USER_SELECT,
    });
  }

  async getPreferences(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    return (user?.preferences as Record<string, unknown> | null) ?? {};
  }

  /** Shallow-merge the incoming patch with the existing preferences JSON. */
  async updatePreferences(
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const current = await this.getPreferences(userId);
    const next = { ...current, ...patch };
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: next as object },
    });
    return next;
  }

  async adminResetPassword(userId: string, dto: AdminResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
    return { message: 'Password reset successfully' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // On récupère le hash en clair (non inclus dans USER_SELECT)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
  }
}
