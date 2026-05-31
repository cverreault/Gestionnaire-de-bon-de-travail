-- Form templates for work orders

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TemplateFieldType') THEN
    CREATE TYPE "TemplateFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'CHECKBOX', 'SELECT', 'DATE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "work_order_templates" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_work_order_templates_is_active" ON "work_order_templates" ("is_active");

CREATE TABLE IF NOT EXISTS "template_sections" (
  "id"          TEXT PRIMARY KEY,
  "template_id" TEXT NOT NULL REFERENCES "work_order_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name"        TEXT NOT NULL,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_template_sections_template_id" ON "template_sections" ("template_id");

CREATE TABLE IF NOT EXISTS "template_fields" (
  "id"          TEXT PRIMARY KEY,
  "section_id"  TEXT NOT NULL REFERENCES "template_sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "label"       TEXT NOT NULL,
  "field_type"  "TemplateFieldType" NOT NULL DEFAULT 'TEXT',
  "required"    BOOLEAN NOT NULL DEFAULT false,
  "placeholder" TEXT,
  "help_text"   TEXT,
  "options"     JSONB,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_template_fields_section_id" ON "template_fields" ("section_id");

-- Link TaskType to a template (optional)
ALTER TABLE "task_types" ADD COLUMN IF NOT EXISTS "template_id" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_types_template_id_fkey'
  ) THEN
    ALTER TABLE "task_types"
      ADD CONSTRAINT "task_types_template_id_fkey"
      FOREIGN KEY ("template_id") REFERENCES "work_order_templates" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Store filled values on the work order itself
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "template_data" JSONB;
