-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ADJUSTMENT', 'TRANSFER_TO_TECH', 'TRANSFER_TO_WAREHOUSE', 'USAGE', 'USAGE_REVERT');

-- CreateEnum
CREATE TYPE "PartSource" AS ENUM ('WAREHOUSE', 'TECHNICIAN_STOCK');

-- CreateTable
CREATE TABLE "parts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_fr" TEXT NOT NULL DEFAULT '',
    "name_en" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'un',
    "cost_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sale_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_part_stocks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "part_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technician_part_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "part_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "technician_id" TEXT,
    "work_order_id" TEXT,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_parts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "work_order_id" TEXT NOT NULL,
    "part_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source" "PartSource" NOT NULL DEFAULT 'WAREHOUSE',
    "unit_cost_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unit_sale_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "added_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_parts_tenant_id" ON "parts"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_parts_is_active" ON "parts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_parts_tenant_sku" ON "parts"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "idx_tech_part_stock_technician" ON "technician_part_stocks"("technician_id");

-- CreateIndex
CREATE INDEX "idx_tech_part_stock_tenant_id" ON "technician_part_stocks"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tech_part_stock" ON "technician_part_stocks"("part_id", "technician_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_part_created" ON "stock_movements"("part_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_stock_movements_tenant_id" ON "stock_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_work_order_parts_wo" ON "work_order_parts"("work_order_id");

-- CreateIndex
CREATE INDEX "idx_work_order_parts_tenant_id" ON "work_order_parts"("tenant_id");

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_part_stocks" ADD CONSTRAINT "technician_part_stocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_part_stocks" ADD CONSTRAINT "technician_part_stocks_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_part_stocks" ADD CONSTRAINT "technician_part_stocks_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
