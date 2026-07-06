import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RemindersService } from '../application/reminders.service';

class CreateReminderDto {
  @IsDateString()
  sendAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  channels!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bodyTemplate?: string;
}

/**
 * B15 — Reminder endpoints under work-orders.
 *
 * ADMIN / DISPATCHER only. Technicians don't manage reminders — they
 * receive them via the notifications inbox.
 */
@ApiTags('Reminders')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN, Role.DISPATCHER)
@Controller('work-orders/:workOrderId/reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les rappels d\'un BT' })
  async list(
    @CurrentUser() actor: { tenantId: string },
    @Param('workOrderId') workOrderId: string,
  ) {
    return this.reminders.list(actor.tenantId, workOrderId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Programmer un nouveau rappel' })
  async create(
    @CurrentUser() actor: { id: string; tenantId: string },
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CreateReminderDto,
  ) {
    return this.reminders.create({
      tenantId: actor.tenantId,
      workOrderId,
      createdByUserId: actor.id,
      sendAt: dto.sendAt,
      channels: dto.channels,
      bodyTemplate: dto.bodyTemplate,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Annuler un rappel en attente' })
  async cancel(
    @CurrentUser() actor: { tenantId: string },
    @Param('id') id: string,
  ) {
    await this.reminders.cancel(actor.tenantId, id);
  }
}
