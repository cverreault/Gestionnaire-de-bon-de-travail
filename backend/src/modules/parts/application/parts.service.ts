import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreatePartDto } from '../api/dto/create-part.dto';
import { UpdatePartDto } from '../api/dto/update-part.dto';

/**
 * B24 — parts catalog CRUD (settings/task-types pattern). Stock math
 * lives in StockService; this service only touches catalog fields.
 */
@Injectable()
export class PartsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(search?: string, includeInactive = false) {
    const where: Prisma.PartWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { nameFr: { contains: search, mode: 'insensitive' } },
              { nameEn: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const parts = await this.prisma.part.findMany({
      where,
      include: {
        technicianStocks: { select: { quantity: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return parts.map((p) => ({
      ...p,
      technicianStocks: undefined,
      costPrice: Number(p.costPrice),
      salePrice: Number(p.salePrice),
      truckQuantity: p.technicianStocks.reduce((acc, s) => acc + s.quantity, 0),
      lowStock: p.minStock > 0 && p.quantityOnHand < p.minStock,
    }));
  }

  /** Lightweight list for the work-order part selector (all staff + techs). */
  async catalog() {
    return this.prisma.part.findMany({
      where: { isActive: true },
      select: { id: true, sku: true, name: true, nameFr: true, nameEn: true, unit: true },
      orderBy: { name: 'asc' },
    });
  }

  async stockByTechnician() {
    const rows = await this.prisma.technicianPartStock.findMany({
      where: { quantity: { gt: 0 } },
      include: {
        part: { select: { sku: true, name: true, nameFr: true, nameEn: true, unit: true } },
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ technicianId: 'asc' }],
    });
    return rows;
  }

  async movements(partId: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { partId },
        include: {
          technician: { select: { firstName: true, lastName: true } },
          createdBy: { select: { firstName: true, lastName: true } },
          workOrder: { select: { referenceNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.stockMovement.count({ where: { partId } }),
    ]);
    return { items, total, page: Math.max(page, 1), limit: take };
  }

  async create(dto: CreatePartDto) {
    const existing = await this.prisma.part.findFirst({
      where: { sku: { equals: dto.sku.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(`Le SKU « ${dto.sku} » existe déjà`);
    }
    return this.prisma.part.create({
      data: {
        sku: dto.sku.trim(),
        name: dto.name,
        nameFr: dto.nameFr ?? '',
        nameEn: dto.nameEn ?? '',
        description: dto.description ?? null,
        unit: dto.unit ?? 'un',
        costPrice: dto.costPrice ?? 0,
        salePrice: dto.salePrice ?? 0,
        minStock: dto.minStock ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdatePartDto) {
    const part = await this.prisma.part.findUnique({ where: { id } });
    if (!part) throw new NotFoundException('Pièce introuvable');
    if (dto.sku && dto.sku.trim().toLowerCase() !== part.sku.toLowerCase()) {
      const dup = await this.prisma.part.findFirst({
        where: { sku: { equals: dto.sku.trim(), mode: 'insensitive' }, id: { not: id } },
      });
      if (dup) throw new ConflictException(`Le SKU « ${dto.sku} » existe déjà`);
    }
    return this.prisma.part.update({
      where: { id },
      data: {
        ...(dto.sku !== undefined && { sku: dto.sku.trim() }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.nameFr !== undefined && { nameFr: dto.nameFr }),
        ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.costPrice !== undefined && { costPrice: dto.costPrice }),
        ...(dto.salePrice !== undefined && { salePrice: dto.salePrice }),
        ...(dto.minStock !== undefined && { minStock: dto.minStock }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /** Soft delete — parts on active work orders keep their history. */
  async softDelete(id: string) {
    const part = await this.prisma.part.findUnique({ where: { id } });
    if (!part) throw new NotFoundException('Pièce introuvable');
    const activeUsage = await this.prisma.workOrderPart.count({
      where: {
        partId: id,
        workOrder: {
          status: {
            notIn: [WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.COMPLETED_NEGATIVE],
          },
        },
      },
    });
    if (activeUsage > 0) {
      throw new ConflictException(
        `Impossible de désactiver : la pièce est utilisée sur ${activeUsage} bon(s) de travail actif(s)`,
      );
    }
    return this.prisma.part.update({ where: { id }, data: { isActive: false } });
  }
}
