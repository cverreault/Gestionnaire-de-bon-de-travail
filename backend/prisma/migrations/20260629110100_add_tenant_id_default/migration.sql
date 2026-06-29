-- B6.1 — Temporary default on tenant_id (will be removed in B6.4)
--
-- Every business table got a NOT NULL tenant_id in the previous migration.
-- This default unblocks existing INSERT statements that don't yet carry
-- a tenant_id (i.e., all business services pre-middleware).
--
-- B6.4 introduces a Prisma $extends middleware that injects the
-- current request's tenant_id explicitly. At that point this default
-- becomes a defensive fallback rather than the primary path.

ALTER TABLE "users"                  ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "temporary_clients"      ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "clients"                ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "client_addresses"       ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "task_types"             ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "work_order_templates"   ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "template_sections"      ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "template_fields"        ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "client_type_configs"    ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "address_type_configs"   ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "address_type_fields"    ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "work_orders"            ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "notes"                  ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "attachments"            ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "appointments"           ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "process_definitions"    ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "process_statuses"       ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "process_transitions"    ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "audit_logs"             ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "refresh_tokens"         ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "notifications"          ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "push_subscriptions"     ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "technician_locations"   ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';
