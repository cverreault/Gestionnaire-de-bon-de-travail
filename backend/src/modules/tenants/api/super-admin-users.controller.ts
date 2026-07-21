import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Roles } from '../../../common/decorators/roles.decorator';

/**
 * Cross-tenant user search (B7).
 *
 * GET /super-admin/users?email=<prefix> returns every user whose email
 * starts with the query, across every tenant. Each row carries its
 * tenant context so the SA can decide which tenant to enter.
 *
 * Hard limit : 50 results. The SA narrows the search with a more
 * specific email rather than paginating.
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/users')
export class SuperAdminUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Recherche d\'un user par email cross-tenant' })
  @ApiQuery({
    name: 'email',
    required: true,
    description: 'Email exact ou préfixe — case-insensitive',
  })
  async search(@Query('email') email?: string) {
    if (!email || email.trim().length < 2) {
      return [];
    }

    type Row = {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: Role;
      is_active: boolean;
      tenant_id: string;
      tenant_slug: string;
      tenant_name: string;
    };

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
         t.id AS tenant_id, t.slug AS tenant_slug, t.name AS tenant_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE LOWER(u.email) LIKE LOWER($1) || '%'
       ORDER BY u.email ASC
       LIMIT 50`,
      email.trim(),
    );

    return rows.map((r) => ({
        id: r.id,
        email: r.email,
        firstName: r.first_name,
        lastName: r.last_name,
        role: r.role,
        isActive: r.is_active,
        tenant: {
          id: r.tenant_id,
          slug: r.tenant_slug,
          name: r.tenant_name,
        },
      }));
  }
}
