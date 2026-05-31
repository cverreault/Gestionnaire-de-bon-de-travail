-- ============================================================================
-- TaskMgr — Complete Migration (Combined from 6 individual migrations)
-- ============================================================================
-- This file merges all Prisma migrations into a single deployable SQL
-- To apply: psql -U taskmgr -h localhost -p 5434 -d taskmgr < taskmgr_complete_migrations.sql
-- ============================================================================

-- ============================================================================
-- Migration: 00000000000000_init
-- ============================================================================

-- ============================================================
-- Migration: init (baseline)
-- Creates the original schema: enums, users, temporary_clients,
-- work_orders, notes, attachments, appointments.
-- This is the state BEFORE the EN_ROUTE status was added.
-- ============================================================

-- CreateEnum: Role (without DISPATCHER — added later in v3_core)
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TECHNICIAN');

-- CreateEnum: WorkOrderStatus (without EN_ROUTE — added later)
CREATE TYPE "WorkOrderStatus" AS ENUM (
    'CREATED',
    'ASSIGNED',
    'DISPATCHED',
    'IN_PROGRESS',
    'COMPLETED_POSITIVE',
    'COMPLETED_NEGATIVE'
);

-- CreateEnum: WorkOrderType
CREATE TYPE "WorkOrderType" AS ENUM (
    'INSTALLATION',
    'REPAIR',
    'MAINTENANCE',
    'INSPECTION',
    'OTHER'
);

-- CreateTable: users
CREATE TABLE "users" (
    "id"          TEXT         NOT NULL,
    "email"       TEXT         NOT NULL,
    "password"    TEXT         NOT NULL,
    "first_name"  TEXT         NOT NULL,
    "last_name"   TEXT         NOT NULL,
    "role"        "Role"       NOT NULL DEFAULT 'TECHNICIAN',
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "phone"       TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: users
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable: temporary_clients
CREATE TABLE "temporary_clients" (
    "id"          TEXT         NOT NULL,
    "first_name"  TEXT         NOT NULL,
    "last_name"   TEXT         NOT NULL,
    "email"       TEXT,
    "phone"       TEXT,
    "address"     TEXT,
    "city"        TEXT,
    "postal_code" TEXT,
    "notes"       TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "temporary_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable: work_orders
CREATE TABLE "work_orders" (
    "id"                  TEXT              NOT NULL,
    "reference_number"    TEXT              NOT NULL,
    "status"              "WorkOrderStatus" NOT NULL DEFAULT 'CREATED',
    "type"                "WorkOrderType"   NOT NULL DEFAULT 'OTHER',
    "title"               TEXT              NOT NULL,
    "description"         TEXT,
    "priority"            INTEGER           NOT NULL DEFAULT 0,
    "temporary_client_id" TEXT,
    "external_client_id"  TEXT,
    "external_client_name" TEXT,
    "client_address"      TEXT,
    "assigned_to_id"      TEXT,
    "created_by_id"       TEXT              NOT NULL,
    "scheduled_date"      TIMESTAMP(3),
    "scheduled_start_time" TIMESTAMP(3),
    "scheduled_end_time"  TIMESTAMP(3),
    "actual_start_time"   TIMESTAMP(3),
    "actual_end_time"     TIMESTAMP(3),
    "completion_notes"    TEXT,
    "negative_reason"     TEXT,
    "dispatched_at"       TIMESTAMP(3),
    "created_at"          TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: work_orders
CREATE UNIQUE INDEX "work_orders_reference_number_key" ON "work_orders"("reference_number");
CREATE INDEX "work_orders_status_idx"           ON "work_orders"("status");
CREATE INDEX "work_orders_assigned_to_id_idx"   ON "work_orders"("assigned_to_id");
CREATE INDEX "work_orders_scheduled_date_idx"   ON "work_orders"("scheduled_date");
CREATE INDEX "work_orders_reference_number_idx" ON "work_orders"("reference_number");

-- AddForeignKey: work_orders → users (assigned_to)
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_orders → users (created_by)
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: work_orders → temporary_clients
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_temporary_client_id_fkey"
    FOREIGN KEY ("temporary_client_id") REFERENCES "temporary_clients"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: notes
CREATE TABLE "notes" (
    "id"            TEXT         NOT NULL,
    "content"       TEXT         NOT NULL,
    "work_order_id" TEXT         NOT NULL,
    "author_id"     TEXT         NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: notes → work_orders
ALTER TABLE "notes"
    ADD CONSTRAINT "notes_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: notes → users
ALTER TABLE "notes"
    ADD CONSTRAINT "notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: attachments
CREATE TABLE "attachments" (
    "id"            TEXT         NOT NULL,
    "file_name"     TEXT         NOT NULL,
    "file_size"     INTEGER      NOT NULL,
    "mime_type"     TEXT         NOT NULL,
    "storage_key"   TEXT         NOT NULL,
    "work_order_id" TEXT         NOT NULL,
    "uploaded_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: attachments → work_orders
ALTER TABLE "attachments"
    ADD CONSTRAINT "attachments_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: appointments
CREATE TABLE "appointments" (
    "id"             TEXT         NOT NULL,
    "title"          TEXT         NOT NULL,
    "description"    TEXT,
    "start_time"     TIMESTAMP(3) NOT NULL,
    "end_time"       TIMESTAMP(3) NOT NULL,
    "technician_id"  TEXT,
    "work_order_id"  TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: appointments
CREATE INDEX "appointments_start_time_end_time_idx" ON "appointments"("start_time", "end_time");
CREATE INDEX "appointments_technician_id_idx"       ON "appointments"("technician_id");

-- ============================================================================
-- Migration: 20260430000000_add_en_route_status
-- ============================================================================

-- AlterEnum
-- Adding EN_ROUTE value to WorkOrderStatus enum between DISPATCHED and IN_PROGRESS.
-- PostgreSQL requires ADD VALUE outside a transaction block for enum mutations.
ALTER TYPE "WorkOrderStatus" ADD VALUE 'EN_ROUTE' AFTER 'DISPATCHED';

-- ============================================================================
-- Migration: 20260501000000_v3_core
-- ============================================================================

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

-- ============================================================================
-- Migration: 20260501000001_add_type_config_tables
-- ============================================================================

-- CreateTable
CREATE TABLE "client_type_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#3b82f6',
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_type_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#3b82f6',
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_type_configs_name_key" ON "client_type_configs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "client_type_configs_code_key" ON "client_type_configs"("code");

-- CreateIndex
CREATE INDEX "idx_client_type_configs_is_active" ON "client_type_configs"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "address_type_configs_name_key" ON "address_type_configs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "address_type_configs_code_key" ON "address_type_configs"("code");

-- CreateIndex
CREATE INDEX "idx_address_type_configs_is_active" ON "address_type_configs"("isActive");

-- ============================================================================
-- Migration: 20260502000001_add_task_type_prefix
-- ============================================================================

-- Ajouter la colonne nullable
ALTER TABLE "task_types" ADD COLUMN "prefix" VARCHAR(10);

-- Générer des préfixes uniques à partir du nom (3 premières lettres en majuscules)
UPDATE "task_types" SET "prefix" = UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), 3));

-- S'assurer qu'il n'y a pas de doublons en ajoutant un suffixe numérique si nécessaire
-- (cas rare mais possible)
DO $$
DECLARE
  r RECORD;
  counter INT;
  new_prefix VARCHAR(10);
BEGIN
  FOR r IN (
    SELECT id, prefix, ROW_NUMBER() OVER (PARTITION BY prefix ORDER BY created_at) as rn
    FROM task_types
    WHERE prefix IN (SELECT prefix FROM task_types GROUP BY prefix HAVING COUNT(*) > 1)
  ) LOOP
    IF r.rn > 1 THEN
      counter := r.rn;
      new_prefix := r.prefix || counter::text;
      UPDATE task_types SET prefix = new_prefix WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Rendre NOT NULL
ALTER TABLE "task_types" ALTER COLUMN "prefix" SET NOT NULL;

-- Ajouter la contrainte d'unicité
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_prefix_key" UNIQUE ("prefix");

-- ============================================================================
-- Migration: 20260502000002_add_process_engine
-- ============================================================================

-- ============================================================
-- Migration: add_process_engine
-- Adds:  process_definitions, process_statuses, process_transitions
--        FK columns on task_types (process_definition_id)
--        FK columns on work_orders (process_definition_id, current_step_id)
-- ============================================================

-- CreateTable: process_definitions
CREATE TABLE "process_definitions" (
    "id"          TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "version"     INTEGER      NOT NULL DEFAULT 1,
    "is_default"  BOOLEAN      NOT NULL DEFAULT false,
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: process_statuses
CREATE TABLE "process_statuses" (
    "id"                    TEXT         NOT NULL,
    "process_definition_id" TEXT         NOT NULL,
    "code"                  INTEGER      NOT NULL,
    "name"                  TEXT         NOT NULL,
    "color"                 TEXT         NOT NULL DEFAULT '#6b7280',
    "position"              INTEGER      NOT NULL,
    "is_initial"            BOOLEAN      NOT NULL DEFAULT false,
    "is_dispatch"           BOOLEAN      NOT NULL DEFAULT false,
    "is_start"              BOOLEAN      NOT NULL DEFAULT false,
    "is_terminal_positive"  BOOLEAN      NOT NULL DEFAULT false,
    "is_terminal_negative"  BOOLEAN      NOT NULL DEFAULT false,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable: process_transitions
CREATE TABLE "process_transitions" (
    "id"                    TEXT         NOT NULL,
    "process_definition_id" TEXT         NOT NULL,
    "from_status_id"        TEXT         NOT NULL,
    "to_status_id"          TEXT         NOT NULL,
    "label"                 TEXT         NOT NULL,
    "allowedRoles"          "Role"[]     NOT NULL DEFAULT ARRAY[]::"Role"[],
    "requiredFields"        TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sort_order"            INTEGER      NOT NULL DEFAULT 0,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_transitions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: task_types — add nullable FK to process_definitions
ALTER TABLE "task_types"
    ADD COLUMN "process_definition_id" TEXT;

-- AlterTable: work_orders — add nullable FK columns for process engine
ALTER TABLE "work_orders"
    ADD COLUMN "process_definition_id" TEXT,
    ADD COLUMN "current_step_id"       TEXT;

-- CreateIndex: process_definitions
CREATE UNIQUE INDEX "process_definitions_name_key"
    ON "process_definitions"("name");

CREATE INDEX "idx_process_definitions_is_default"
    ON "process_definitions"("is_default");

CREATE INDEX "idx_process_definitions_is_active"
    ON "process_definitions"("is_active");

-- CreateIndex: process_statuses
CREATE UNIQUE INDEX "uq_process_status_definition_code"
    ON "process_statuses"("process_definition_id", "code");

CREATE INDEX "idx_process_statuses_definition_id"
    ON "process_statuses"("process_definition_id");

CREATE INDEX "idx_process_statuses_position"
    ON "process_statuses"("position");

-- CreateIndex: process_transitions
CREATE UNIQUE INDEX "uq_process_transition_unique"
    ON "process_transitions"("process_definition_id", "from_status_id", "to_status_id");

CREATE INDEX "idx_process_transitions_definition_id"
    ON "process_transitions"("process_definition_id");

CREATE INDEX "idx_process_transitions_from_status_id"
    ON "process_transitions"("from_status_id");

-- CreateIndex: work_orders (process engine columns)
CREATE INDEX "idx_work_orders_process_definition_id"
    ON "work_orders"("process_definition_id");

CREATE INDEX "idx_work_orders_current_step_id"
    ON "work_orders"("current_step_id");

-- AddForeignKey: process_statuses → process_definitions (CASCADE)
ALTER TABLE "process_statuses"
    ADD CONSTRAINT "process_statuses_process_definition_id_fkey"
    FOREIGN KEY ("process_definition_id")
    REFERENCES "process_definitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: process_transitions → process_definitions (CASCADE)
ALTER TABLE "process_transitions"
    ADD CONSTRAINT "process_transitions_process_definition_id_fkey"
    FOREIGN KEY ("process_definition_id")
    REFERENCES "process_definitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: process_transitions → process_statuses (from_status_id)
ALTER TABLE "process_transitions"
    ADD CONSTRAINT "process_transitions_from_status_id_fkey"
    FOREIGN KEY ("from_status_id")
    REFERENCES "process_statuses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: process_transitions → process_statuses (to_status_id)
ALTER TABLE "process_transitions"
    ADD CONSTRAINT "process_transitions_to_status_id_fkey"
    FOREIGN KEY ("to_status_id")
    REFERENCES "process_statuses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: task_types → process_definitions
ALTER TABLE "task_types"
    ADD CONSTRAINT "task_types_process_definition_id_fkey"
    FOREIGN KEY ("process_definition_id")
    REFERENCES "process_definitions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_orders → process_definitions
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_process_definition_id_fkey"
    FOREIGN KEY ("process_definition_id")
    REFERENCES "process_definitions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_orders → process_statuses (current_step_id)
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_current_step_id_fkey"
    FOREIGN KEY ("current_step_id")
    REFERENCES "process_statuses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

