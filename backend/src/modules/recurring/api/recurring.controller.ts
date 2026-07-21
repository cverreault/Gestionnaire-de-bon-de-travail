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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  RecurringWorkOrdersService,
  type CreateRecurringInput,
  type UpdateRecurringInput,
} from '../application/recurring-work-orders.service';
import { CreateRecurringDto } from './dto/create-recurring.dto';
import { UpdateRecurringDto } from './dto/update-recurring.dto';

@ApiTags('Recurring work orders')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN, Role.DISPATCHER)
@Controller('recurring-work-orders')
export class RecurringController {
  constructor(private readonly recurring: RecurringWorkOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les bons récurrents du tenant' })
  async list(@CurrentUser() actor: { tenantId: string }) {
    return this.recurring.list(actor.tenantId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
  ) {
    return this.recurring.findOne(actor.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Body() dto: CreateRecurringDto,
  ) {
    return this.recurring.create(this.toCreateInput(actor, dto));
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdateRecurringDto,
  ) {
    return this.recurring.update(actor.tenantId, id, this.toUpdateInput(dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Param('id') id: string,
  ) {
    await this.recurring.remove(actor.tenantId, id, actor.id);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aperçu des prochaines dates de spawn pour un schedule',
  })
  preview(
    @Body() dto: CreateRecurringDto,
    @Query('count') count?: string,
  ) {
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

  private toCreateInput(
    actor: { id: string; tenantId: string },
    dto: CreateRecurringDto,
  ): CreateRecurringInput {
    return {
      tenantId: actor.tenantId,
      createdByUserId: actor.id,
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
    };
  }

  private toUpdateInput(dto: UpdateRecurringDto): UpdateRecurringInput {
    return {
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
    };
  }

  private parseDate(iso: string, field: string): Date {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Date invalide pour ${field}: ${iso}`);
    }
    return d;
  }
}
