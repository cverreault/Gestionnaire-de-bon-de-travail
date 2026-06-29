-- B6.7 — Per-tenant uniques for the bootstrap-able catalog tables
--
-- Self-service signup creates a fresh "Installation" task type, a
-- "Standard BT" process, RESIDENTIAL / COMMERCIAL client types, etc.
-- for every new tenant. With globally-unique names / codes, the second
-- signup would crash on the unique constraint.
--
-- Migration : drop the global UNIQUE constraint on each affected
-- column (IF EXISTS so it's safe to re-run after a partial apply),
-- then add a composite (tenant_id, X) unique.

-- TaskType : name + prefix
ALTER TABLE "task_types" DROP CONSTRAINT IF EXISTS "task_types_name_key";
ALTER TABLE "task_types" DROP CONSTRAINT IF EXISTS "task_types_prefix_key";
DROP INDEX IF EXISTS "task_types_name_key";
DROP INDEX IF EXISTS "task_types_prefix_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_task_types_tenant_name"
  ON "task_types" ("tenant_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_task_types_tenant_prefix"
  ON "task_types" ("tenant_id", "prefix");

-- WorkOrderTemplate : name
ALTER TABLE "work_order_templates" DROP CONSTRAINT IF EXISTS "work_order_templates_name_key";
DROP INDEX IF EXISTS "work_order_templates_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_work_order_templates_tenant_name"
  ON "work_order_templates" ("tenant_id", "name");

-- ClientTypeConfig : name + code
ALTER TABLE "client_type_configs" DROP CONSTRAINT IF EXISTS "client_type_configs_name_key";
ALTER TABLE "client_type_configs" DROP CONSTRAINT IF EXISTS "client_type_configs_code_key";
DROP INDEX IF EXISTS "client_type_configs_name_key";
DROP INDEX IF EXISTS "client_type_configs_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_client_type_configs_tenant_name"
  ON "client_type_configs" ("tenant_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_client_type_configs_tenant_code"
  ON "client_type_configs" ("tenant_id", "code");

-- AddressTypeConfig : name + code
ALTER TABLE "address_type_configs" DROP CONSTRAINT IF EXISTS "address_type_configs_name_key";
ALTER TABLE "address_type_configs" DROP CONSTRAINT IF EXISTS "address_type_configs_code_key";
DROP INDEX IF EXISTS "address_type_configs_name_key";
DROP INDEX IF EXISTS "address_type_configs_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_address_type_configs_tenant_name"
  ON "address_type_configs" ("tenant_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_address_type_configs_tenant_code"
  ON "address_type_configs" ("tenant_id", "code");

-- ProcessDefinition : name
ALTER TABLE "process_definitions" DROP CONSTRAINT IF EXISTS "process_definitions_name_key";
DROP INDEX IF EXISTS "process_definitions_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_process_definitions_tenant_name"
  ON "process_definitions" ("tenant_id", "name");

-- WorkOrder : reference_number per-tenant
ALTER TABLE "work_orders" DROP CONSTRAINT IF EXISTS "work_orders_reference_number_key";
DROP INDEX IF EXISTS "work_orders_reference_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_work_orders_tenant_reference"
  ON "work_orders" ("tenant_id", "reference_number");
