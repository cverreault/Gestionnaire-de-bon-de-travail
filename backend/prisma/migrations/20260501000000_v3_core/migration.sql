-- ============================================================
-- Migration V3 Core — TaskMgr
-- Adds: DISPATCHER role, ClientType/AddressType enums,
--       clients, client_addresses, task_types tables,
--       new FK columns on work_orders,
--       FK constraints on appointments.
-- NOTE: PostgreSQL enum mutations must run outside a transaction.
-- ============================================================

-- AlterEnum: Add DISPATCHER to Role
ALTER TYPE "Role" ADD VALUE 'DISPATCHER';

-- CreateEnum: ClientType
CREATE TYPE "ClientType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'INSTITUTIONAL');

-- CreateEnum: AddressType
CREATE TYPE "AddressType" AS ENUM ('OFFICE', 'WAREHOUSE', 'RESIDENCE', 'WORKSITE');

-- CreateTable: clients
CREATE TABLE "clients" (
    "id"          TEXT        NOT NULL,
    "first_name"  TEXT        NOT NULL,
    "last_name"   TEXT        NOT NULL,
    "email"       TEXT,
    "phone"       TEXT,
    "client_type" "ClientType" NOT NULL DEFAULT 'RESIDENTIAL',
    "notes"       TEXT,
    "is_active"   BOOLEAN     NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: clients
CREATE INDEX "idx_clients_type"      ON "clients"("client_type");
CREATE INDEX "idx_clients_is_active" ON "clients"("is_active");

-- CreateTable: client_addresses
CREATE TABLE "client_addresses" (
    "id"           TEXT          NOT NULL,
    "client_id"    TEXT          NOT NULL,
    "street"       TEXT          NOT NULL,
    "city"         TEXT          NOT NULL,
    "postal_code"  TEXT          NOT NULL,
    "province"     TEXT          NOT NULL DEFAULT 'Québec',
    "country"      TEXT          NOT NULL DEFAULT 'Canada',
    "address_type" "AddressType" NOT NULL DEFAULT 'RESIDENCE',
    "label"        TEXT,
    "is_default"   BOOLEAN       NOT NULL DEFAULT false,
    "latitude"     DOUBLE PRECISION,
    "longitude"    DOUBLE PRECISION,
    "created_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "client_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: client_addresses
CREATE INDEX "idx_client_addresses_client_id" ON "client_addresses"("client_id");

-- AddForeignKey: client_addresses → clients
ALTER TABLE "client_addresses"
    ADD CONSTRAINT "client_addresses_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: task_types
CREATE TABLE "task_types" (
    "id"          TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "color"       TEXT,
    "icon"        TEXT,
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_types_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex: task_types.name
CREATE UNIQUE INDEX "task_types_name_key" ON "task_types"("name");

-- CreateIndex: task_types
CREATE INDEX "idx_task_types_is_active" ON "task_types"("is_active");

-- AlterTable: work_orders — add V3 FK columns
ALTER TABLE "work_orders"
    ADD COLUMN "task_type_id"       TEXT,
    ADD COLUMN "client_id"          TEXT,
    ADD COLUMN "client_address_id"  TEXT;

-- CreateIndex: work_orders new indexes
CREATE INDEX "idx_work_orders_client_id"    ON "work_orders"("client_id");
CREATE INDEX "idx_work_orders_task_type_id" ON "work_orders"("task_type_id");

-- AddForeignKey: work_orders → task_types
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_task_type_id_fkey"
    FOREIGN KEY ("task_type_id") REFERENCES "task_types"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_orders → clients
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_orders → client_addresses
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_client_address_id_fkey"
    FOREIGN KEY ("client_address_id") REFERENCES "client_addresses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: appointments → users (technician)
ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_technician_id_fkey"
    FOREIGN KEY ("technician_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: appointments → work_orders
ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
