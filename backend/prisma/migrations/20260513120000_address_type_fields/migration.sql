-- Custom fields per AddressTypeConfig + free-form value bag on each ClientAddress.
-- Same pattern as WorkOrderTemplate / templateData on WorkOrder.

CREATE TABLE IF NOT EXISTS "address_type_fields" (
  "id"                       TEXT PRIMARY KEY,
  "address_type_config_id"   TEXT NOT NULL
                             REFERENCES "address_type_configs" ("id")
                             ON DELETE CASCADE ON UPDATE CASCADE,
  "label"                    TEXT NOT NULL,
  "field_type"               "TemplateFieldType" NOT NULL DEFAULT 'TEXT',
  "required"                 BOOLEAN NOT NULL DEFAULT false,
  "options"                  JSONB,
  "sort_order"               INTEGER NOT NULL DEFAULT 0,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_address_type_fields_config_id"
  ON "address_type_fields" ("address_type_config_id");

ALTER TABLE "address_type_configs"
  ADD COLUMN IF NOT EXISTS "predominant_field_id" TEXT;

ALTER TABLE "client_addresses"
  ADD COLUMN IF NOT EXISTS "type_data" JSONB;
