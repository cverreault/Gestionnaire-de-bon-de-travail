-- B6.1 — Multi-tenancy foundation
--
-- One Tenant row per logical customer. Every business table gets a
-- mandatory tenant_id FK so the upcoming Prisma $extends middleware
-- (B6.4) + Postgres RLS (B6.5) can filter without any per-call work.
--
-- Self-hosted deployments stay compatible: a single DEFAULT tenant
-- (stable UUID 00000000-0000-0000-0000-000000000001) holds every
-- pre-multi-tenancy row.

-- ── Tenants table ─────────────────────────────────────────────────
CREATE TYPE "TenantPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "plan" "TenantPlan" NOT NULL DEFAULT 'FREE',

    -- Quotas (B6.6 enforces). Overridable per-tenant by the SA.
    "max_users" INTEGER NOT NULL DEFAULT 3,
    "max_work_orders_per_month" INTEGER NOT NULL DEFAULT 50,
    "max_storage_mb" INTEGER NOT NULL DEFAULT 100,
    "max_clients" INTEGER NOT NULL DEFAULT 50,

    -- Counters (B6.6 maintains).
    "current_users" INTEGER NOT NULL DEFAULT 0,
    "current_work_orders_this_month" INTEGER NOT NULL DEFAULT 0,
    "current_storage_bytes" BIGINT NOT NULL DEFAULT 0,
    "current_clients" INTEGER NOT NULL DEFAULT 0,
    "work_orders_reset_at" TIMESTAMP(3),

    "owner_email" TEXT,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" ("slug");
CREATE INDEX "idx_tenants_is_active" ON "tenants" ("is_active");

-- ── Seed the DEFAULT tenant (self-hosted backfill target) ─────────
INSERT INTO "tenants" (
    "id", "slug", "name", "is_active", "plan",
    "max_users", "max_work_orders_per_month", "max_storage_mb", "max_clients",
    "updated_at"
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    'Default tenant (self-hosted)',
    true,
    'ENTERPRISE',
    100000, 100000, 100000, 100000,
    CURRENT_TIMESTAMP
);

-- ── Helper: add a tenant_id column to a business table ────────────
-- Each block follows the same pattern:
--   1. ADD COLUMN nullable
--   2. UPDATE all rows to the DEFAULT tenant
--   3. SET NOT NULL
--   4. ADD FK
--   5. CREATE INDEX

-- USERS
ALTER TABLE "users" ADD COLUMN "tenant_id" TEXT;
UPDATE "users" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_users_tenant_id" ON "users" ("tenant_id");

-- TEMPORARY_CLIENTS
ALTER TABLE "temporary_clients" ADD COLUMN "tenant_id" TEXT;
UPDATE "temporary_clients" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "temporary_clients" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "temporary_clients" ADD CONSTRAINT "temporary_clients_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_temporary_clients_tenant_id" ON "temporary_clients" ("tenant_id");

-- CLIENTS
ALTER TABLE "clients" ADD COLUMN "tenant_id" TEXT;
UPDATE "clients" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "clients" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_clients_tenant_id" ON "clients" ("tenant_id");

-- CLIENT_ADDRESSES
ALTER TABLE "client_addresses" ADD COLUMN "tenant_id" TEXT;
UPDATE "client_addresses" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "client_addresses" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_client_addresses_tenant_id" ON "client_addresses" ("tenant_id");

-- TASK_TYPES
ALTER TABLE "task_types" ADD COLUMN "tenant_id" TEXT;
UPDATE "task_types" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "task_types" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_task_types_tenant_id" ON "task_types" ("tenant_id");

-- WORK_ORDER_TEMPLATES
ALTER TABLE "work_order_templates" ADD COLUMN "tenant_id" TEXT;
UPDATE "work_order_templates" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "work_order_templates" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "work_order_templates" ADD CONSTRAINT "work_order_templates_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_work_order_templates_tenant_id" ON "work_order_templates" ("tenant_id");

-- TEMPLATE_SECTIONS
ALTER TABLE "template_sections" ADD COLUMN "tenant_id" TEXT;
UPDATE "template_sections" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "template_sections" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "template_sections" ADD CONSTRAINT "template_sections_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_template_sections_tenant_id" ON "template_sections" ("tenant_id");

-- TEMPLATE_FIELDS
ALTER TABLE "template_fields" ADD COLUMN "tenant_id" TEXT;
UPDATE "template_fields" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "template_fields" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "template_fields" ADD CONSTRAINT "template_fields_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_template_fields_tenant_id" ON "template_fields" ("tenant_id");

-- CLIENT_TYPE_CONFIGS
ALTER TABLE "client_type_configs" ADD COLUMN "tenant_id" TEXT;
UPDATE "client_type_configs" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "client_type_configs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "client_type_configs" ADD CONSTRAINT "client_type_configs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_client_type_configs_tenant_id" ON "client_type_configs" ("tenant_id");

-- ADDRESS_TYPE_CONFIGS
ALTER TABLE "address_type_configs" ADD COLUMN "tenant_id" TEXT;
UPDATE "address_type_configs" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "address_type_configs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "address_type_configs" ADD CONSTRAINT "address_type_configs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_address_type_configs_tenant_id" ON "address_type_configs" ("tenant_id");

-- ADDRESS_TYPE_FIELDS
ALTER TABLE "address_type_fields" ADD COLUMN "tenant_id" TEXT;
UPDATE "address_type_fields" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "address_type_fields" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "address_type_fields" ADD CONSTRAINT "address_type_fields_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_address_type_fields_tenant_id" ON "address_type_fields" ("tenant_id");

-- WORK_ORDERS
ALTER TABLE "work_orders" ADD COLUMN "tenant_id" TEXT;
UPDATE "work_orders" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "work_orders" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_work_orders_tenant_id" ON "work_orders" ("tenant_id");

-- NOTES
ALTER TABLE "notes" ADD COLUMN "tenant_id" TEXT;
UPDATE "notes" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "notes" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "notes" ADD CONSTRAINT "notes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_notes_tenant_id" ON "notes" ("tenant_id");

-- ATTACHMENTS
ALTER TABLE "attachments" ADD COLUMN "tenant_id" TEXT;
UPDATE "attachments" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "attachments" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_attachments_tenant_id" ON "attachments" ("tenant_id");

-- APPOINTMENTS
ALTER TABLE "appointments" ADD COLUMN "tenant_id" TEXT;
UPDATE "appointments" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "appointments" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_appointments_tenant_id" ON "appointments" ("tenant_id");

-- PROCESS_DEFINITIONS
ALTER TABLE "process_definitions" ADD COLUMN "tenant_id" TEXT;
UPDATE "process_definitions" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "process_definitions" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "process_definitions" ADD CONSTRAINT "process_definitions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_process_definitions_tenant_id" ON "process_definitions" ("tenant_id");

-- PROCESS_STATUSES
ALTER TABLE "process_statuses" ADD COLUMN "tenant_id" TEXT;
UPDATE "process_statuses" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "process_statuses" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "process_statuses" ADD CONSTRAINT "process_statuses_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_process_statuses_tenant_id" ON "process_statuses" ("tenant_id");

-- PROCESS_TRANSITIONS
ALTER TABLE "process_transitions" ADD COLUMN "tenant_id" TEXT;
UPDATE "process_transitions" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "process_transitions" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "process_transitions" ADD CONSTRAINT "process_transitions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_process_transitions_tenant_id" ON "process_transitions" ("tenant_id");

-- AUDIT_LOGS
ALTER TABLE "audit_logs" ADD COLUMN "tenant_id" TEXT;
UPDATE "audit_logs" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "audit_logs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_audit_logs_tenant_id" ON "audit_logs" ("tenant_id");

-- REFRESH_TOKENS
ALTER TABLE "refresh_tokens" ADD COLUMN "tenant_id" TEXT;
UPDATE "refresh_tokens" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "refresh_tokens" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_refresh_tokens_tenant_id" ON "refresh_tokens" ("tenant_id");

-- NOTIFICATIONS
ALTER TABLE "notifications" ADD COLUMN "tenant_id" TEXT;
UPDATE "notifications" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "notifications" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_notifications_tenant_id" ON "notifications" ("tenant_id");

-- PUSH_SUBSCRIPTIONS
ALTER TABLE "push_subscriptions" ADD COLUMN "tenant_id" TEXT;
UPDATE "push_subscriptions" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "push_subscriptions" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_push_subscriptions_tenant_id" ON "push_subscriptions" ("tenant_id");

-- TECHNICIAN_LOCATIONS
ALTER TABLE "technician_locations" ADD COLUMN "tenant_id" TEXT;
UPDATE "technician_locations" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "technician_locations" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "technician_locations" ADD CONSTRAINT "technician_locations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_technician_locations_tenant_id" ON "technician_locations" ("tenant_id");

-- ── system_configs : dual-scope (GLOBAL / TENANT) ─────────────────
-- Old PK was just (key). New shape: id PK, tenant_id NULLABLE, scope enum,
-- unique constraint (tenant_id, key) with NULLS NOT DISTINCT so NULL
-- tenant_id collapses to a single "global" row per key.
CREATE TYPE "SystemConfigScope" AS ENUM ('GLOBAL', 'TENANT');

ALTER TABLE "system_configs" ADD COLUMN "id" TEXT;
UPDATE "system_configs" SET "id" = gen_random_uuid()::text;
ALTER TABLE "system_configs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "system_configs" DROP CONSTRAINT "system_configs_pkey";
ALTER TABLE "system_configs" ADD CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id");

ALTER TABLE "system_configs" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "system_configs" ADD COLUMN "scope" "SystemConfigScope" NOT NULL DEFAULT 'GLOBAL';

-- Existing rows are all GLOBAL (tenant_id stays NULL).
ALTER TABLE "system_configs" ADD CONSTRAINT "system_configs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "idx_system_configs_tenant_key"
  ON "system_configs" ("tenant_id", "key") NULLS NOT DISTINCT;

CREATE INDEX "idx_system_configs_tenant_id" ON "system_configs" ("tenant_id");
