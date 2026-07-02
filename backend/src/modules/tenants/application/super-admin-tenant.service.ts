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
import { PlansService } from './plans.service';

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
    private readonly plans: PlansService,
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

    // Resolve the four quotas — for each field, the SA's explicit DTO
    // value wins; otherwise we fall back to the plan's defaults (read
    // from the `plans` table). This way a brand-new tenant inherits
    // coherent caps right away instead of the bare Prisma schema
    // defaults (which still target the FREE tier).
    const plan = await this.plans.getByCode(dto.plan ?? 'FREE');
    const resolvedQuotas: Pick<
      Prisma.TenantCreateInput,
      'maxUsers' | 'maxWorkOrdersPerMonth' | 'maxStorageMb' | 'maxClients'
    > = {
      maxUsers: dto.maxUsers ?? plan.quotas.maxUsers,
      maxWorkOrdersPerMonth:
        dto.maxWorkOrdersPerMonth ?? plan.quotas.maxWorkOrdersPerMonth,
      maxStorageMb: dto.maxStorageMb ?? plan.quotas.maxStorageMb,
      maxClients: dto.maxClients ?? plan.quotas.maxClients,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          plan: dto.plan ?? 'FREE',
          ownerEmail: dto.admin.email,
          ...resolvedQuotas,
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
    //
    // Raw SQL : the tenant-scope middleware (B6.4) would otherwise rewrite
    // where.tenantId with the calling SA's own tenant, turning this into a
    // self-check that always trips (the SA always lives somewhere) and
    // making delete impossible for any tenant that isn't the SA's own.
    type Row = { id: string };
    const saRows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id FROM users WHERE tenant_id = $1 AND role = 'SUPER_ADMIN' LIMIT 1`,
      id,
    );
    if (saRows.length > 0) {
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
      // Neutralise BOTH the Postgres RLS GUC and the Prisma tenant-scope
      // middleware (B6.4) for this tx. The middleware rewrites
      // `where.tenantId` on every Prisma call to the calling SA's own
      // tenant — that would mean we silently delete DEFAULT's children
      // (not the target tenant's) and then fail FK when removing the
      // tenant row. Using $executeRawUnsafe sidesteps the middleware
      // entirely (it only intercepts model calls, not raw SQL).
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = ''`);

      const del = (table: string) =>
        tx.$executeRawUnsafe(
          `DELETE FROM ${table} WHERE tenant_id = $1`,
          id,
        );

      // ── Leaf rows first (respecting the 3 RESTRICT inter-FKs) ──
      await del('attachments');
      await del('notes');
      await del('appointments');
      await del('technician_locations');
      await del('push_subscriptions');
      await del('notifications');
      await del('refresh_tokens');
      await del('audit_logs');
      await del('work_orders');           // before users (createdBy RESTRICT)
      await del('process_transitions');   // before process_statuses
      await del('process_statuses');
      await del('process_definitions');
      await del('task_types');
      await del('template_fields');
      await del('template_sections');
      await del('work_order_templates');
      await del('address_type_fields');
      await del('address_type_configs');
      await del('client_type_configs');
      await del('client_addresses');
      await del('clients');
      await del('temporary_clients');
      await del('system_configs');
      // Users last among children — email_verifications cascade off the user.
      await del('users');
      // Finally the tenant row itself.
      await tx.$executeRawUnsafe(`DELETE FROM tenants WHERE id = $1`, id);
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
