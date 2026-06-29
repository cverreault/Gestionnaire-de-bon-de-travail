import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantBootstrapService } from './tenant-bootstrap.service';
import { SignupDto } from '../api/dto/signup.dto';

/**
 * Self-service tenant creation (B6.7).
 *
 * Pipeline (single transaction) :
 *   1. Reject the slug if already taken (race-safe via the unique index)
 *   2. Create the Tenant row (FREE plan by default)
 *   3. Hash + create the first ADMIN user
 *   4. Seed the catalog : process / task types / client types / address types
 *
 * Either everything commits, or the whole signup rolls back. The
 * client can retry the request without leftover rows.
 *
 * Rate limiting (1 signup per IP per minute) is enforced upstream by
 * the @Throttle decorator on the controller.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bootstrap: TenantBootstrapService,
  ) {}

  async signup(dto: SignupDto): Promise<{
    tenant: { id: string; slug: string; name: string };
    user: { id: string; email: string };
  }> {
    // Friendly pre-check — the unique index still wins the race for
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

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: dto.slug,
          name: dto.organizationName,
          plan: 'FREE',
          ownerEmail: dto.email,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          password: passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: Role.ADMIN,
          isActive: true,
        },
      });

      // current_users counter on the tenant starts at 1 — atomic update
      // inside the same transaction so no signup leaves the counter at 0
      // for its own admin.
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { currentUsers: 1 },
      });

      await this.bootstrap.seed(tx, tenant.id);

      return { tenant, user };
    });

    this.logger.log(
      `🆕 New tenant signed up : slug=${result.tenant.slug} name="${result.tenant.name}" admin=${result.user.email}`,
    );

    return {
      tenant: {
        id: result.tenant.id,
        slug: result.tenant.slug,
        name: result.tenant.name,
      },
      user: { id: result.user.id, email: result.user.email },
    };
  }
}
