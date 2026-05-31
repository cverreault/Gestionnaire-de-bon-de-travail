import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, WorkOrderStatus, TemplateFieldType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProcessCacheService } from '../process/process-cache.service';
import { CreateTaskTypeDto } from './dto/create-task-type.dto';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto';
import { CreateClientTypeDto } from './dto/create-client-type.dto';
import { UpdateClientTypeDto } from './dto/update-client-type.dto';
import { CreateAddressTypeDto } from './dto/create-address-type.dto';
import { UpdateAddressTypeDto } from './dto/update-address-type.dto';

/** Statuts considérés comme "actifs" (BT non terminés) */
const ACTIVE_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.CREATED,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.DISPATCHED,
  WorkOrderStatus.EN_ROUTE,
  WorkOrderStatus.IN_PROGRESS,
];

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processCache: ProcessCacheService,
  ) {}

  // ── TaskTypes CRUD ─────────────────────────────────────────────────────────

  /**
   * Retourne tous les TaskTypes.
   * @param query.isActive — si fourni, filtre par état actif/inactif
   */
  async findAll(query: { isActive?: boolean }) {
    const where =
      query.isActive !== undefined ? { isActive: query.isActive } : {};

    return this.prisma.taskType.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      include: {
        template: { select: { id: true, name: true } },
        processDefinition: { select: { id: true, name: true, isDefault: true } },
      },
    });
  }

  /**
   * Retourne un TaskType par son identifiant.
   * Lève NotFoundException si inexistant.
   */
  async findOne(id: string) {
    const taskType = await this.prisma.taskType.findUnique({ where: { id } });
    if (!taskType) {
      throw new NotFoundException(`Type de tâche #${id} introuvable`);
    }
    return taskType;
  }

  /**
   * Crée un nouveau TaskType.
   * Vérifie l'unicité du nom (insensible à la casse).
   */
  async create(dto: CreateTaskTypeDto) {
    await this.assertNameUnique(dto.name);
    await this.assertPrefixUnique(dto.prefix);

    const taskType = await this.prisma.taskType.create({
      data: {
        name: dto.name.trim(),
        prefix: dto.prefix.trim().toUpperCase(),
        description: dto.description?.trim() ?? null,
        color: dto.color ?? null,
        icon: dto.icon ?? null,
        templateId: dto.templateId ?? null,
        processDefinitionId: dto.processDefinitionId ?? null,
      },
    });

    this.logger.log(`TaskType créé : "${taskType.name}" (${taskType.id})`);
    return taskType;
  }

  /**
   * Met à jour un TaskType existant.
   * Vérifie l'unicité du nom si celui-ci est modifié.
   */
  async update(id: string, dto: UpdateTaskTypeDto) {
    await this.findOne(id); // lève 404 si inexistant

    if (dto.name !== undefined) {
      await this.assertNameUnique(dto.name, id);
    }
    if (dto.prefix !== undefined) {
      await this.assertPrefixUnique(dto.prefix, id);
    }

    const taskType = await this.prisma.taskType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.prefix !== undefined && { prefix: dto.prefix.trim().toUpperCase() }),
        ...(dto.description !== undefined && {
          description: dto.description?.trim() ?? null,
        }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.templateId !== undefined && { templateId: dto.templateId }),
        ...(dto.processDefinitionId !== undefined && {
          processDefinitionId: dto.processDefinitionId,
        }),
      },
    });

    // Invalidate the process cache so the new mapping takes effect immediately.
    if (dto.processDefinitionId !== undefined) {
      this.processCache.invalidateTaskType(id);
    }

    this.logger.log(`TaskType mis à jour : "${taskType.name}" (${taskType.id})`);
    return taskType;
  }

  /**
   * Désactive (soft-delete) un TaskType.
   * Refuse si des BT actifs sont encore liés à ce type.
   */
  async softDelete(id: string) {
    await this.findOne(id); // lève 404 si inexistant

    const activeWorkOrdersCount = await this.prisma.workOrder.count({
      where: {
        taskTypeId: id,
        status: { in: ACTIVE_STATUSES },
      },
    });

    if (activeWorkOrdersCount > 0) {
      throw new BadRequestException(
        `Impossible de désactiver ce type de tâche : ${activeWorkOrdersCount} bon(s) de travail actif(s) y sont liés.`,
      );
    }

    const taskType = await this.prisma.taskType.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`TaskType désactivé : "${taskType.name}" (${taskType.id})`);
    return taskType;
  }

  // ── ClientTypeConfig CRUD ──────────────────────────────────────────────────

  /**
   * Retourne tous les ClientTypeConfigs, triés par sortOrder puis name.
   * @param query.isActive — si fourni, filtre par état actif/inactif
   */
  async findAllClientTypes(query: { isActive?: boolean } = {}) {
    const where =
      query.isActive !== undefined ? { isActive: query.isActive } : {};

    return this.prisma.clientTypeConfig.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Retourne un ClientTypeConfig par son identifiant.
   * Lève NotFoundException si inexistant.
   */
  async findOneClientType(id: string) {
    const record = await this.prisma.clientTypeConfig.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Type de client #${id} introuvable`);
    }
    return record;
  }

  /**
   * Crée un nouveau ClientTypeConfig.
   * Vérifie l'unicité du nom et du code (insensibles à la casse).
   */
  async createClientType(dto: CreateClientTypeDto) {
    await this.assertClientTypeNameUnique(dto.name);
    await this.assertClientTypeCodeUnique(dto.code);

    const record = await this.prisma.clientTypeConfig.create({
      data: {
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        description: dto.description?.trim() ?? null,
        color: dto.color ?? '#3b82f6',
        icon: dto.icon ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    this.logger.log(`ClientTypeConfig créé : "${record.name}" [${record.code}] (${record.id})`);
    return record;
  }

  /**
   * Met à jour un ClientTypeConfig existant.
   */
  async updateClientType(id: string, dto: UpdateClientTypeDto) {
    await this.findOneClientType(id); // lève 404 si inexistant

    if (dto.name !== undefined) {
      await this.assertClientTypeNameUnique(dto.name, id);
    }
    if (dto.code !== undefined) {
      await this.assertClientTypeCodeUnique(dto.code, id);
    }

    const record = await this.prisma.clientTypeConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
        ...(dto.description !== undefined && {
          description: dto.description?.trim() ?? null,
        }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });

    this.logger.log(`ClientTypeConfig mis à jour : "${record.name}" (${record.id})`);
    return record;
  }

  /**
   * Désactive (soft-delete) un ClientTypeConfig.
   */
  async deleteClientType(id: string) {
    await this.findOneClientType(id); // lève 404 si inexistant

    const record = await this.prisma.clientTypeConfig.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`ClientTypeConfig désactivé : "${record.name}" (${record.id})`);
    return record;
  }

  // ── AddressTypeConfig CRUD ─────────────────────────────────────────────────

  /**
   * Retourne tous les AddressTypeConfigs, triés par sortOrder puis name.
   * @param query.isActive — si fourni, filtre par état actif/inactif
   */
  async findAllAddressTypes(query: { isActive?: boolean } = {}) {
    const where =
      query.isActive !== undefined ? { isActive: query.isActive } : {};

    return this.prisma.addressTypeConfig.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /**
   * Retourne un AddressTypeConfig par son identifiant.
   * Lève NotFoundException si inexistant.
   */
  async findOneAddressType(id: string) {
    const record = await this.prisma.addressTypeConfig.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Type d'emplacement #${id} introuvable`);
    }
    return record;
  }

  /**
   * Crée un nouveau AddressTypeConfig.
   * Vérifie l'unicité du nom et du code (insensibles à la casse).
   */
  async createAddressType(dto: CreateAddressTypeDto) {
    await this.assertAddressTypeNameUnique(dto.name);
    await this.assertAddressTypeCodeUnique(dto.code);

    const record = await this.prisma.addressTypeConfig.create({
      data: {
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        description: dto.description?.trim() ?? null,
        color: dto.color ?? '#3b82f6',
        icon: dto.icon ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    this.logger.log(`AddressTypeConfig créé : "${record.name}" [${record.code}] (${record.id})`);
    return record;
  }

  /**
   * Met à jour un AddressTypeConfig existant.
   */
  async updateAddressType(id: string, dto: UpdateAddressTypeDto) {
    await this.findOneAddressType(id); // lève 404 si inexistant

    if (dto.name !== undefined) {
      await this.assertAddressTypeNameUnique(dto.name, id);
    }
    if (dto.code !== undefined) {
      await this.assertAddressTypeCodeUnique(dto.code, id);
    }

    const record = await this.prisma.addressTypeConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
        ...(dto.description !== undefined && {
          description: dto.description?.trim() ?? null,
        }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.predominantFieldId !== undefined && {
          predominantFieldId: dto.predominantFieldId,
        }),
      },
    });

    this.logger.log(`AddressTypeConfig mis à jour : "${record.name}" (${record.id})`);
    return record;
  }

  // ── AddressTypeConfig — custom fields CRUD ─────────────────────────────────

  async listAddressTypeFields(addressTypeConfigId: string) {
    await this.findOneAddressType(addressTypeConfigId);
    return this.prisma.addressTypeField.findMany({
      where: { addressTypeConfigId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addAddressTypeField(addressTypeConfigId: string, dto: {
    label: string;
    fieldType: TemplateFieldType;
    required?: boolean;
    options?: string[];
    sortOrder?: number;
  }) {
    await this.findOneAddressType(addressTypeConfigId);
    const last = await this.prisma.addressTypeField.findFirst({
      where: { addressTypeConfigId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.addressTypeField.create({
      data: {
        addressTypeConfigId,
        label: dto.label,
        fieldType: dto.fieldType,
        required: dto.required ?? false,
        options: dto.options
          ? (dto.options as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        sortOrder: dto.sortOrder ?? (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateAddressTypeField(
    addressTypeConfigId: string,
    fieldId: string,
    dto: Partial<{
      label: string;
      fieldType: TemplateFieldType;
      required: boolean;
      options: string[];
      sortOrder: number;
    }>,
  ) {
    const field = await this.prisma.addressTypeField.findFirst({
      where: { id: fieldId, addressTypeConfigId },
    });
    if (!field) {
      throw new NotFoundException(
        `Champ #${fieldId} introuvable pour le type d'emplacement #${addressTypeConfigId}`,
      );
    }
    return this.prisma.addressTypeField.update({
      where: { id: fieldId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.fieldType !== undefined && { fieldType: dto.fieldType }),
        ...(dto.required !== undefined && { required: dto.required }),
        ...(dto.options !== undefined && {
          options: dto.options as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async removeAddressTypeField(addressTypeConfigId: string, fieldId: string) {
    const field = await this.prisma.addressTypeField.findFirst({
      where: { id: fieldId, addressTypeConfigId },
    });
    if (!field) {
      throw new NotFoundException(
        `Champ #${fieldId} introuvable pour le type d'emplacement #${addressTypeConfigId}`,
      );
    }
    return this.prisma.addressTypeField.delete({ where: { id: fieldId } });
  }

  /**
   * Désactive (soft-delete) un AddressTypeConfig.
   */
  async deleteAddressType(id: string) {
    await this.findOneAddressType(id); // lève 404 si inexistant

    const record = await this.prisma.addressTypeConfig.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`AddressTypeConfig désactivé : "${record.name}" (${record.id})`);
    return record;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Vérifie qu'aucun TaskType portant le même nom n'existe déjà (insensible
   * à la casse). Le paramètre `excludeId` permet d'ignorer l'enregistrement
   * courant lors d'une mise à jour.
   */
  private async assertNameUnique(name: string, excludeId?: string) {
    const existing = await this.prisma.taskType.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });

    if (existing) {
      throw new ConflictException(
        `Un type de tâche portant le nom "${existing.name}" existe déjà.`,
      );
    }
  }

  private async assertPrefixUnique(prefix: string, excludeId?: string) {
    const existing = await this.prisma.taskType.findFirst({
      where: {
        prefix: { equals: prefix.trim().toUpperCase(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, prefix: true },
    });
    if (existing) {
      throw new ConflictException(
        `Le préfixe "${existing.prefix}" est déjà utilisé.`,
      );
    }
  }

  private async assertClientTypeNameUnique(name: string, excludeId?: string) {
    const existing = await this.prisma.clientTypeConfig.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });

    if (existing) {
      throw new ConflictException(
        `Un type de client portant le nom "${existing.name}" existe déjà.`,
      );
    }
  }

  private async assertClientTypeCodeUnique(code: string, excludeId?: string) {
    const existing = await this.prisma.clientTypeConfig.findFirst({
      where: {
        code: { equals: code.trim().toUpperCase(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, code: true },
    });

    if (existing) {
      throw new ConflictException(
        `Un type de client avec le code "${existing.code}" existe déjà.`,
      );
    }
  }

  private async assertAddressTypeNameUnique(name: string, excludeId?: string) {
    const existing = await this.prisma.addressTypeConfig.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });

    if (existing) {
      throw new ConflictException(
        `Un type d'emplacement portant le nom "${existing.name}" existe déjà.`,
      );
    }
  }

  private async assertAddressTypeCodeUnique(code: string, excludeId?: string) {
    const existing = await this.prisma.addressTypeConfig.findFirst({
      where: {
        code: { equals: code.trim().toUpperCase(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, code: true },
    });

    if (existing) {
      throw new ConflictException(
        `Un type d'emplacement avec le code "${existing.code}" existe déjà.`,
      );
    }
  }
}
