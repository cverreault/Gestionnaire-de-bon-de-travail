import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MinioService } from '../../../common/storage/minio.service';
import { DEFAULT_TENANT_ID } from '../../../common/contracts/tenant-context.contract';
import { TenantBootstrapService } from './tenant-bootstrap.service';
import { CreateTenantDto } from '../api/dto/create-tenant.dto';

/**
 * SUPER_ADMIN-driven tenant provisioning (B7.5).
 *
 * Mirrors the self-service SignupService pipeline (create tenant → create
 * first ADMIN → seed catalog, all in one transaction) but is operator-only :
 *  - the SA may pick the plan and override quota caps at creation time,
 *  - no IP throttle,
 *  - `ownerEmail` is set to the first admin's email for traceability.
 *
 * Either everything commits or the whole creation rolls back, so a failed
 * call never leaves a half-provisioned tenant behind.
 */
@Injectable()
export class SuperAdminTenantService {
  private readonly logger = new Logger(SuperAdminTenantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bootstrap: TenantBootstrapService,
    private readonly minio: MinioService,
  ) {}

  async createTenant(dto: CreateTenantDto): Promise<{
    tenant: {
      id: string;
      slug: string;
      name: string;
      plan: string;
    };
    admin: { id: string; email: string };
  }> {
    // Friendly pre-check — the unique index on slug still wins the race for
    // simultaneous requests, but most cases give a clean 409.
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `Le slug « ${dto.slug} » est déjà utilisé. Choisissez-en un autre.`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.admin.password, 10);

    // Only forward quota overrides the SA actually set — undefined fields
    // fall back to the Prisma schema defaults (which track the plan).
    const quotaOverrides: Pick<
      Prisma.TenantCreateInput,
      'maxUsers' | 'maxWorkOrdersPerMonth' | 'maxStorageMb' | 'maxClients'
    > = {};
    if (dto.maxUsers !== undefined) quotaOverrides.maxUsers = dto.maxUsers;
    if (dto.maxWorkOrdersPerMonth !== undefined)
      quotaOverrides.maxWorkOrdersPerMonth = dto.maxWorkOrdersPerMonth;
    if (dto.maxStorageMb !== undefined)
      quotaOverrides.maxStorageMb = dto.maxStorageMb;
    if (dto.maxClients !== undefined) quotaOverrides.maxClients = dto.maxClients;

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          plan: dto.plan ?? 'FREE',
          ownerEmail: dto.admin.email,
          ...quotaOverrides,
        },
      });

      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.admin.email,
          password: passwordHash,
          firstName: dto.admin.firstName,
          lastName: dto.admin.lastName,
          role: Role.ADMIN,
          isActive: true,
        },
      });

      // current_users counter starts at 1 for the admin we just created —
      // same transaction so the counter is never left at 0.
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { currentUsers: 1 },
      });

      await this.bootstrap.seed(tx, tenant.id);

      return { tenant, admin };
    });

    this.logger.log(
      `🏗️  SA created tenant : slug=${result.tenant.slug} name="${result.tenant.name}" plan=${result.tenant.plan} admin=${result.admin.email}`,
    );

    return {
      tenant: {
        id: result.tenant.id,
        slug: result.tenant.slug,
        name: result.tenant.name,
        plan: result.tenant.plan,
      },
      admin: { id: result.admin.id, email: result.admin.email },
    };
  }

  /**
   * Hard-delete a tenant and ALL of its data (B7.5).
   *
   * This is irreversible. Guard rails :
   *  - never the DEFAULT tenant,
   *  - never a tenant that owns a SUPER_ADMIN (would lock the operator out),
   *  - `confirmSlug` must match the tenant slug exactly (typed confirmation).
   *
   * Every business table carries `tenant_id` but the tenant FKs are RESTRICT,
   * so we delete children before the tenant. The order also respects the three
   * RESTRICT inter-table FKs (notes→users, work_orders→users,
   * process_transitions→process_statuses); everything else is CASCADE / SET
   * NULL. The whole thing runs in one transaction — all-or-nothing.
   *
   * MinIO objects (attachments + logo) are collected first and purged after the
   * DB commit (best-effort — a storage hiccup must not resurrect the tenant).
   */
  async deleteTenant(
    id: string,
    confirmSlug: string,
  ): Promise<{ deleted: true; slug: string }> {
    if (id === DEFAULT_TENANT_ID) {
      throw new BadRequestException(
        'Le tenant par défaut ne peut pas être supprimé.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, logoStorageKey: true },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} introuvable`);
    }

    if (confirmSlug !== tenant.slug) {
      throw new BadRequestException(
        'La confirmation ne correspond pas au slug du tenant.',
      );
    }

    // Refuse if the tenant owns a SUPER_ADMIN — deleting it would remove an
    // operator account. SA accounts must be moved out first.
    const sa = await this.prisma.user.findFirst({
      where: { tenantId: id, role: Role.SUPER_ADMIN },
      select: { id: true },
    });
    if (sa) {
      throw new BadRequestException(
        'Ce tenant contient un SUPER_ADMIN — déplacez-le avant de supprimer.',
      );
    }

    // Collect MinIO object keys before the rows vanish.
    const attachments = await this.prisma.attachment.findMany({
      where: { tenantId: id },
      select: { storageKey: true },
    });
    const objectKeys = attachments
      .map((a) => a.storageKey)
      .filter((k): k is string => !!k);
    if (tenant.logoStorageKey) objectKeys.push(tenant.logoStorageKey);

    await this.prisma.$transaction(async (tx) => {
      // Belt-and-suspenders: neutralise the RLS GUC for this tx so the
      // cross-tenant deletes can never be narrowed by an active tenant scope.
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = ''`);

      const where = { tenantId: id };
      // ── Leaf rows first (respecting the 3 RESTRICT inter-FKs) ──
      await tx.attachment.deleteMany({ where });
      await tx.note.deleteMany({ where });
      await tx.appointment.deleteMany({ where });
      await tx.technicianLocation.deleteMany({ where });
      await tx.pushSubscription.deleteMany({ where });
      await tx.notification.deleteMany({ where });
      await tx.refreshToken.deleteMany({ where });
      await tx.auditLog.deleteMany({ where });
      await tx.workOrder.deleteMany({ where }); // before users (createdBy RESTRICT)
      await tx.processTransition.deleteMany({ where }); // before processStatus
      await tx.processStatus.deleteMany({ where });
      await tx.processDefinition.deleteMany({ where });
      await tx.taskType.deleteMany({ where });
      await tx.templateField.deleteMany({ where });
      await tx.templateSection.deleteMany({ where });
      await tx.workOrderTemplate.deleteMany({ where });
      await tx.addressTypeField.deleteMany({ where });
      await tx.addressTypeConfig.deleteMany({ where });
      await tx.clientTypeConfig.deleteMany({ where });
      await tx.clientAddress.deleteMany({ where });
      await tx.client.deleteMany({ where });
      await tx.temporaryClient.deleteMany({ where });
      await tx.systemConfig.deleteMany({ where });
      // Users last among children — emailVerifications cascade off the user.
      await tx.user.deleteMany({ where });
      // Finally the tenant row itself.
      await tx.tenant.delete({ where: { id } });
    });

    // Best-effort object-storage cleanup — failures are logged, not fatal.
    await Promise.allSettled(
      objectKeys.map((key) => this.minio.deleteFile(key)),
    ).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) {
        this.logger.warn(
          `Tenant ${tenant.slug} deleted, but ${failed}/${objectKeys.length} MinIO objects could not be removed.`,
        );
      }
    });

    this.logger.log(
      `🗑️  SA hard-deleted tenant : slug=${tenant.slug} id=${id} (${objectKeys.length} objets MinIO purgés)`,
    );

    return { deleted: true, slug: tenant.slug };
  }
}
