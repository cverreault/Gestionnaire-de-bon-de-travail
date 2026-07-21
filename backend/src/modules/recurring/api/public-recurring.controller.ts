import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Scope } from '../../../common/decorators/scope.decorator';
import { CurrentApiKey } from '../../../common/decorators/current-api-key.decorator';
import type { ResolvedApiKey } from '../../../common/contracts/api-key.contract';
import { PublicApiThrottle } from '../../../common/decorators/public-api-throttle.decorator';
import { RecurringWorkOrdersService } from '../application/recurring-work-orders.service';
import { CreateRecurringDto } from './dto/create-recurring.dto';
import { UpdateRecurringDto } from './dto/update-recurring.dto';

/**
 * Public API v1 — Recurring work orders (B11).
 *
 * External CRMs or maintenance-contract systems can register recurring
 * rules and rely on TaskMgr to spawn the actual work orders. Same DTOs as
 * the internal controller.
 *
 * ─ Scope model ─
 *   All routes require the `admin` scope. A recurring rule spawns real
 *   work orders autonomously — that's an amplification of write access
 *   we don't want a `read-write` key to grant.
 */
@ApiTags('Recurring work orders')
@ApiSecurity('api-key')
@PublicApiThrottle()
@Controller('v1/recurring-work-orders')
export class PublicRecurringController {
  constructor(private readonly recurring: RecurringWorkOrdersService) {}

  @Get()
  @Scope('admin')
  @ApiOperation({ summary: 'Lister les bons récurrents du tenant' })
  async list(@CurrentApiKey() key: ResolvedApiKey) {
    return this.recurring.list(key.tenantId);
  }

  @Get(':id')
  @Scope('admin')
  @ApiOperation({ summary: 'Détail d\'un bon récurrent' })
  async findOne(@Param('id') id: string, @CurrentApiKey() key: ResolvedApiKey) {
    return this.recurring.findOne(key.tenantId, id);
  }

  @Post()
  @Scope('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une règle de BT récurrent' })
  async create(@Body() dto: CreateRecurringDto, @CurrentApiKey() key: ResolvedApiKey) {
    return this.recurring.create({
      tenantId: key.tenantId,
      createdByUserId: key.createdByUserId,
      name: dto.name,
      description: dto.description,
      isActive: dto.isActive,
      taskTypeId: dto.taskTypeId,
      clientId: dto.clientId,
      clientAddressId: dto.clientAddressId ?? null,
      assignedToId: dto.assignedToId ?? null,
      workOrderTitle: dto.workOrderTitle,
      workOrderDescription: dto.workOrderDescription,
      priority: dto.priority,
      frequency: dto.frequency,
      interval: dto.interval,
      byDayOfWeek: dto.byDayOfWeek,
      byDayOfMonth: dto.byDayOfMonth,
      startDate: this.parseDate(dto.startDate, 'startDate'),
      endDate: dto.endDate ? this.parseDate(dto.endDate, 'endDate') : null,
    });
  }

  @Patch(':id')
  @Scope('admin')
  @ApiOperation({ summary: 'Mettre à jour une règle de BT récurrent' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRecurringDto,
    @CurrentApiKey() key: ResolvedApiKey,
  ) {
    return this.recurring.update(key.tenantId, id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.taskTypeId !== undefined && { taskTypeId: dto.taskTypeId }),
      ...(dto.clientId !== undefined && { clientId: dto.clientId }),
      ...(dto.clientAddressId !== undefined && {
        clientAddressId: dto.clientAddressId,
      }),
      ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId }),
      ...(dto.workOrderTitle !== undefined && {
        workOrderTitle: dto.workOrderTitle,
      }),
      ...(dto.workOrderDescription !== undefined && {
        workOrderDescription: dto.workOrderDescription,
      }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
      ...(dto.frequency !== undefined && { frequency: dto.frequency }),
      ...(dto.interval !== undefined && { interval: dto.interval }),
      ...(dto.byDayOfWeek !== undefined && { byDayOfWeek: dto.byDayOfWeek }),
      ...(dto.byDayOfMonth !== undefined && { byDayOfMonth: dto.byDayOfMonth }),
      ...(dto.startDate !== undefined && {
        startDate: this.parseDate(dto.startDate, 'startDate'),
      }),
      ...(dto.endDate !== undefined && {
        endDate: dto.endDate ? this.parseDate(dto.endDate, 'endDate') : null,
      }),
    });
  }

  @Delete(':id')
  @Scope('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une règle de BT récurrent' })
  async remove(@Param('id') id: string, @CurrentApiKey() key: ResolvedApiKey) {
    await this.recurring.remove(key.tenantId, id, key.createdByUserId);
  }

  @Post('preview')
  @Scope('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aperçu des prochaines dates de spawn pour un schedule',
  })
  preview(@Body() dto: CreateRecurringDto, @Query('count') count?: string) {
    const parsed = count ? Number(count) : 5;
    const preview = this.recurring.preview(
      {
        frequency: dto.frequency,
        interval: dto.interval,
        byDayOfWeek: dto.byDayOfWeek,
        byDayOfMonth: dto.byDayOfMonth,
        startDate: this.parseDate(dto.startDate, 'startDate'),
        endDate: dto.endDate ? this.parseDate(dto.endDate, 'endDate') : null,
      },
      Number.isFinite(parsed) && parsed > 0 && parsed <= 30 ? parsed : 5,
    );
    return preview.map((d) => d.toISOString());
  }

  private parseDate(iso: string, field: string): Date {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Date invalide pour ${field}: ${iso}`);
    }
    return d;
  }
}
