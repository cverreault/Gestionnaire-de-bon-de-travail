import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

export const TAG_SELECT = {
  id: true,
  name: true,
  color: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { workOrders: true, clients: true, addresses: true } },
} as const;

/**
 * B44 — tag definitions (name + colour) owned by the settings module.
 * Linking a tag to a client / address / work order is done by the owning
 * aggregate's service (`tagIds` on its DTOs) ; this service only manages
 * the catalogue. Tenant scoping comes from the Prisma middleware.
 */
@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(query: { isActive?: boolean }) {
    const where = query.isActive !== undefined ? { isActive: query.isActive } : {};
    return this.prisma.tag.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      select: TAG_SELECT,
    });
  }

  async findOne(id: string) {
    // findFirst (not findUnique) so the tenant-scope middleware injects tenantId :
    // TAG_SELECT omits tenantId, which the post-fetch check of findUnique relies on.
    const tag = await this.prisma.tag.findFirst({ where: { id }, select: TAG_SELECT });
    if (!tag) throw new NotFoundException(`Tag #${id} introuvable`);
    return tag;
  }

  async create(dto: CreateTagDto) {
    const name = dto.name.trim();
    await this.assertNameUnique(name);
    const tag = await this.prisma.tag.create({
      data: {
        name,
        color: dto.color?.toLowerCase(),
        isActive: dto.isActive ?? true,
        // tenantId is injected by the tenant-scope middleware.
      },
      select: TAG_SELECT,
    });
    this.logger.log(`Tag créé : "${tag.name}" (${tag.id})`);
    return tag;
  }

  async update(id: string, dto: UpdateTagDto) {
    await this.findOne(id);
    const name = dto.name?.trim();
    if (name) await this.assertNameUnique(name, id);
    const tag = await this.prisma.tag.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(dto.color ? { color: dto.color.toLowerCase() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: TAG_SELECT,
    });
    this.logger.log(`Tag modifié : "${tag.name}" (${tag.id})`);
    return tag;
  }

  /** Hard delete : the join rows cascade, the entities themselves stay. */
  async remove(id: string) {
    const tag = await this.findOne(id);
    await this.prisma.tag.delete({ where: { id } });
    this.logger.log(`Tag supprimé : "${tag.name}" (${tag.id})`);
    return tag;
  }

  private async assertNameUnique(name: string, excludeId?: string) {
    const existing = await this.prisma.tag.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new ConflictException(`Un tag portant le nom "${existing.name}" existe déjà.`);
    }
  }
}
