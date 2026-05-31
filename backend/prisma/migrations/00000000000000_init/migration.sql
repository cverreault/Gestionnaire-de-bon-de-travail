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
