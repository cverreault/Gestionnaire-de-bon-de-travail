import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateSectionDto,
  UpdateSectionDto,
  CreateFieldDto,
  UpdateFieldDto,
} from './dto/template.dto';

const TEMPLATE_DETAIL_INCLUDE = {
  sections: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      fields: {
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
};

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Templates ────────────────────────────────────────────────────────────
  findAll(includeInactive = false) {
    return this.prisma.workOrderTemplate.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ name: 'asc' }],
      include: { _count: { select: { sections: true, taskTypes: true } } },
    });
  }

  async findOne(id: string) {
    const tpl = await this.prisma.workOrderTemplate.findUnique({
      where: { id },
      include: TEMPLATE_DETAIL_INCLUDE,
    });
    if (!tpl) throw new NotFoundException(`Template #${id} introuvable`);
    return tpl;
  }

  async create(dto: CreateTemplateDto) {
    // B6.7 — name is now (tenantId, name) composite. findFirst lets
    // the tenant-scope middleware (B6.4) inject the tenant filter.
    const existing = await this.prisma.workOrderTemplate.findFirst({
      where: { name: dto.name },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `Un template nommé « ${dto.name} » existe déjà. Choisissez un autre nom.`,
      );
    }
    return this.prisma.workOrderTemplate.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      },
      include: TEMPLATE_DETAIL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.findOne(id);
    if (dto.name) {
      const existing = await this.prisma.workOrderTemplate.findFirst({
        where: { name: dto.name, NOT: { id } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          `Un template nommé « ${dto.name} » existe déjà.`,
        );
      }
    }
    return this.prisma.workOrderTemplate.update({
      where: { id },
      data: dto as Prisma.WorkOrderTemplateUpdateInput,
      include: TEMPLATE_DETAIL_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.workOrderTemplate.delete({ where: { id } });
  }

  // ── Sections ─────────────────────────────────────────────────────────────
  async addSection(templateId: string, dto: CreateSectionDto) {
    await this.findOne(templateId);
    const last = await this.prisma.templateSection.findFirst({
      where: { templateId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.templateSection.create({
      data: {
        templateId,
        name: dto.name,
        sortOrder: dto.sortOrder ?? (last?.sortOrder ?? -1) + 1,
        ...(dto.viewRoles !== undefined && { viewRoles: dto.viewRoles }),
        ...(dto.editRoles !== undefined && { editRoles: dto.editRoles }),
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updateSection(templateId: string, sectionId: string, dto: UpdateSectionDto) {
    const section = await this.prisma.templateSection.findFirst({
      where: { id: sectionId, templateId },
    });
    if (!section) throw new NotFoundException(`Section #${sectionId} introuvable`);
    return this.prisma.templateSection.update({
      where: { id: sectionId },
      data: dto,
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async removeSection(templateId: string, sectionId: string) {
    const section = await this.prisma.templateSection.findFirst({
      where: { id: sectionId, templateId },
    });
    if (!section) throw new NotFoundException(`Section #${sectionId} introuvable`);
    return this.prisma.templateSection.delete({ where: { id: sectionId } });
  }

  // ── Fields ───────────────────────────────────────────────────────────────
  async addField(templateId: string, sectionId: string, dto: CreateFieldDto) {
    const section = await this.prisma.templateSection.findFirst({
      where: { id: sectionId, templateId },
    });
    if (!section) throw new NotFoundException(`Section #${sectionId} introuvable`);
    const last = await this.prisma.templateField.findFirst({
      where: { sectionId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.templateField.create({
      data: {
        sectionId,
        label: dto.label,
        fieldType: dto.fieldType,
        placeholder: dto.placeholder ?? null,
        helpText: dto.helpText ?? null,
        options: dto.options ? (dto.options as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        sortOrder: dto.sortOrder ?? (last?.sortOrder ?? -1) + 1,
        ...(dto.viewRoles !== undefined && { viewRoles: dto.viewRoles }),
        ...(dto.editRoles !== undefined && { editRoles: dto.editRoles }),
        ...(dto.requiredRoles !== undefined && { requiredRoles: dto.requiredRoles }),
      },
    });
  }

  async updateField(
    templateId: string,
    sectionId: string,
    fieldId: string,
    dto: UpdateFieldDto,
  ) {
    const field = await this.prisma.templateField.findFirst({
      where: { id: fieldId, sectionId, section: { templateId } },
    });
    if (!field) throw new NotFoundException(`Champ #${fieldId} introuvable`);
    return this.prisma.templateField.update({
      where: { id: fieldId },
      data: {
        ...dto,
        options:
          dto.options === undefined
            ? undefined
            : dto.options
              ? (dto.options as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
      } as Prisma.TemplateFieldUpdateInput,
    });
  }

  async removeField(templateId: string, sectionId: string, fieldId: string) {
    const field = await this.prisma.templateField.findFirst({
      where: { id: fieldId, sectionId, section: { templateId } },
    });
    if (!field) throw new NotFoundException(`Champ #${fieldId} introuvable`);
    return this.prisma.templateField.delete({ where: { id: fieldId } });
  }
}

// ─── RBAC helpers ───────────────────────────────────────────────────────────
// These shape the template tree before it leaves the boundary so the frontend
// can render directly without re-checking permissions. Backend writes still
// validate (see work-orders.service.ts update()).

type TemplateLike = {
  sections: Array<{
    viewRoles: Role[];
    editRoles: Role[];
    fields: Array<{
      viewRoles: Role[];
      editRoles: Role[];
      requiredRoles: Role[];
    } & Record<string, unknown>>;
  } & Record<string, unknown>>;
} & Record<string, unknown>;

/**
 * Drop sections/fields the user isn't allowed to view.
 * ADMIN bypasses all filters.
 */
export function filterTemplateForUser<T extends TemplateLike>(
  template: T,
  role: Role,
): T {
  if (role === Role.ADMIN) return template;
  const sections = template.sections
    .filter((s) => s.viewRoles.includes(role))
    .map((s) => ({
      ...s,
      fields: s.fields.filter((f) => f.viewRoles.includes(role)),
    }));
  return { ...template, sections } as T;
}
