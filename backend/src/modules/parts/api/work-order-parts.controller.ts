import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { StockService, StockActor } from '../application/stock.service';
import { AddWorkOrderPartDto } from './dto/add-work-order-part.dto';

/**
 * B24 — parts used on a work order. Technician IDOR guard (own WOs
 * only) is enforced in StockService, mirroring the notes routes.
 */
@ApiTags('Parts')
@ApiBearerAuth('access-token')
@Controller('work-orders/:workOrderId/parts')
export class WorkOrderPartsController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: "Pièces utilisées sur un bon de travail" })
  list(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @CurrentUser() user: StockActor,
  ) {
    return this.stock.listWorkOrderParts(workOrderId, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Ajouter une pièce utilisée (décrémente le stock source, snapshot des prix)',
  })
  add(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: AddWorkOrderPartDto,
    @CurrentUser() user: StockActor,
  ) {
    return this.stock.addWorkOrderPart(workOrderId, dto, user);
  }

  @Delete(':rowId')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Retirer une pièce (re-crédite le stock source)' })
  remove(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @CurrentUser() user: StockActor,
  ) {
    return this.stock.removeWorkOrderPart(workOrderId, rowId, user);
  }
}
