import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PartsService } from '../application/parts.service';
import { StockService, StockActor } from '../application/stock.service';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { AdjustStockDto, ReceiveStockDto, TransferStockDto } from './dto/stock-ops.dto';

/**
 * B24 — parts catalog + stock operations (warehouse & trucks).
 * Catalog management is ADMIN + DISPATCHER; the lightweight /catalog
 * list is also open to TECHNICIAN (part selector on work orders).
 * Raw returns — TransformInterceptor wraps.
 */
@ApiTags('Parts')
@ApiBearerAuth('access-token')
@Controller('parts')
export class PartsController {
  constructor(
    private readonly parts: PartsService,
    private readonly stock: StockService,
  ) {}

  // Declared BEFORE :id routes to avoid path ambiguity.
  @Get('catalog')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Liste allégée des pièces actives (sélecteur BT)' })
  catalog() {
    return this.parts.catalog();
  }

  @Get('stock-by-technician')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Stock par camion/technicien' })
  stockByTechnician() {
    return this.parts.stockByTechnician();
  }

  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Catalogue avec stocks (entrepôt + camions) et drapeau stock bas' })
  findAll(
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.parts.findAll(search, includeInactive === 'true');
  }

  @Post()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une pièce' })
  create(@Body() dto: CreatePartDto) {
    return this.parts.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Modifier une pièce' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePartDto) {
    return this.parts.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Désactiver une pièce (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.parts.softDelete(id);
  }

  @Get(':id/movements')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: "Historique des mouvements d'une pièce" })
  movements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.parts.movements(id, Number(page) || 1, Number(limit) || 20);
  }

  @Post(':id/receive')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réception entrepôt' })
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveStockDto,
    @CurrentUser() user: StockActor,
  ) {
    return this.stock.receive(id, dto.quantity, dto.note, user);
  }

  @Post(':id/adjust')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Ajustement d'inventaire (delta signé, entrepôt ou camion)" })
  adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: StockActor,
  ) {
    return this.stock.adjust(id, dto.quantity, dto.technicianId, dto.note, user);
  }

  @Post(':id/transfer')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfert entrepôt ↔ camion' })
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferStockDto,
    @CurrentUser() user: StockActor,
  ) {
    return this.stock.transfer(id, dto.technicianId, dto.quantity, dto.direction, user);
  }
}
