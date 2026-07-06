import { Module } from '@nestjs/common';
import { PartsController } from './api/parts.controller';
import { WorkOrderPartsController } from './api/work-order-parts.controller';
import { MyStockController } from './api/my-stock.controller';
import { PartsService } from './application/parts.service';
import { StockService } from './application/stock.service';

/**
 * B24 — inventory: parts catalog, warehouse + truck stock with a
 * movement journal, parts used per work order, low-stock alerting via
 * the `inventory.stock.low` event (consumed by notifications).
 */
@Module({
  controllers: [PartsController, WorkOrderPartsController, MyStockController],
  providers: [PartsService, StockService],
})
export class PartsModule {}
