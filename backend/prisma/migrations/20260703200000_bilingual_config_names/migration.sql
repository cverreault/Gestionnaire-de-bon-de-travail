-- B10.2 — bilingual (FR/EN) config-entity name/description/label fields.
--
-- For every user-facing config entity, add:
--   * name_fr / name_en           (replacing single `name`)
--   * description_fr / description_en (replacing single `description`)
--   * label_fr / label_en         (replacing single `label`)
--
-- Legacy columns are kept for backwards-compat until every controller is
-- rewritten (a future migration will drop them). On writes, services must
-- keep the legacy column in sync with the FR value.
--
-- Backfill: copy existing values into BOTH FR and EN. Admin then edits.

-- ─── TaskType ────────────────────────────────────────────────────
ALTER TABLE "task_types"
    ADD COLUMN "name_fr"         TEXT NOT NULL DEFAULT '',
    ADD COLUMN "name_en"         TEXT NOT NULL DEFAULT '',
    ADD COLUMN "description_fr"  TEXT,
    ADD COLUMN "description_en"  TEXT;
UPDATE "task_types"
   SET "name_fr" = COALESCE("name", ''),
       "name_en" = COALESCE("name", ''),
       "description_fr" = "description",
       "description_en" = "description";

-- ─── WorkOrderTemplate ───────────────────────────────────────────
ALTER TABLE "work_order_templates"
    ADD COLUMN "name_fr"         TEXT NOT NULL DEFAULT '',
    ADD COLUMN "name_en"         TEXT NOT NULL DEFAULT '',
    ADD COLUMN "description_fr"  TEXT,
    ADD COLUMN "description_en"  TEXT;
UPDATE "work_order_templates"
   SET "name_fr" = COALESCE("name", ''),
       "name_en" = COALESCE("name", ''),
       "description_fr" = "description",
       "description_en" = "description";

-- ─── TemplateSection ─────────────────────────────────────────────
ALTER TABLE "template_sections"
    ADD COLUMN "name_fr" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "name_en" TEXT NOT NULL DEFAULT '';
UPDATE "template_sections"
   SET "name_fr" = COALESCE("name", ''),
       "name_en" = COALESCE("name", '');

-- ─── TemplateField ───────────────────────────────────────────────
ALTER TABLE "template_fields"
    ADD COLUMN "label_fr" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "label_en" TEXT NOT NULL DEFAULT '';
UPDATE "template_fields"
   SET "label_fr" = COALESCE("label", ''),
       "label_en" = COALESCE("label", '');

-- ─── ClientTypeConfig ────────────────────────────────────────────
ALTER TABLE "client_type_configs"
    ADD COLUMN "name_fr"        TEXT NOT NULL DEFAULT '',
    ADD COLUMN "name_en"        TEXT NOT NULL DEFAULT '',
    ADD COLUMN "description_fr" TEXT,
    ADD COLUMN "description_en" TEXT;
UPDATE "client_type_configs"
   SET "name_fr" = COALESCE("name", ''),
       "name_en" = COALESCE("name", ''),
       "description_fr" = "description",
       "description_en" = "description";

-- ─── AddressTypeConfig ───────────────────────────────────────────
ALTER TABLE "address_type_configs"
    ADD COLUMN "name_fr"        TEXT NOT NULL DEFAULT '',
    ADD COLUMN "name_en"        TEXT NOT NULL DEFAULT '',
    ADD COLUMN "description_fr" TEXT,
    ADD COLUMN "description_en" TEXT;
UPDATE "address_type_configs"
   SET "name_fr" = COALESCE("name", ''),
       "name_en" = COALESCE("name", ''),
       "description_fr" = "description",
       "description_en" = "description";

-- ─── AddressTypeField ────────────────────────────────────────────
ALTER TABLE "address_type_fields"
    ADD COLUMN "label_fr" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "label_en" TEXT NOT NULL DEFAULT '';
UPDATE "address_type_fields"
   SET "label_fr" = COALESCE("label", ''),
       "label_en" = COALESCE("label", '');

-- ─── ProcessStatus ───────────────────────────────────────────────
ALTER TABLE "process_statuses"
    ADD COLUMN "name_fr" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "name_en" TEXT NOT NULL DEFAULT '';
UPDATE "process_statuses"
   SET "name_fr" = COALESCE("name", ''),
       "name_en" = COALESCE("name", '');

-- ─── ProcessTransition ───────────────────────────────────────────
ALTER TABLE "process_transitions"
    ADD COLUMN "label_fr" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "label_en" TEXT NOT NULL DEFAULT '';
UPDATE "process_transitions"
   SET "label_fr" = COALESCE("label", ''),
       "label_en" = COALESCE("label", '');
