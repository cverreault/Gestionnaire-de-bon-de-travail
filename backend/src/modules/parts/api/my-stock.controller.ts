import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { StockService, StockActor } from '../application/stock.service';

/** B24 — technician self-service view of their truck stock. */
@ApiTags('Parts')
@ApiBearerAuth('access-token')
@Controller('me/parts-stock')
export class MyStockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Mon stock de camion' })
  myStock(@CurrentUser() user: StockActor) {
    return this.stock.myTruckStock(user.id);
  }
}
