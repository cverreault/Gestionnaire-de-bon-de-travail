-- ─── RBAC on TemplateSection & TemplateField ───────────────────────────────
-- Each section / field carries its own role-based visibility, edit and
-- required arrays. Empty `viewRoles` / `editRoles` means "no one can
-- view/edit" (admins always bypass at the application layer). Defaults
-- preserve the previous "everyone allowed" behaviour for existing rows.

ALTER TABLE "template_sections"
  ADD COLUMN IF NOT EXISTS "view_roles" "Role"[] NOT NULL
    DEFAULT ARRAY['ADMIN','DISPATCHER','TECHNICIAN']::"Role"[],
  ADD COLUMN IF NOT EXISTS "edit_roles" "Role"[] NOT NULL
    DEFAULT ARRAY['ADMIN','DISPATCHER','TECHNICIAN']::"Role"[];

ALTER TABLE "template_fields"
  ADD COLUMN IF NOT EXISTS "view_roles" "Role"[] NOT NULL
    DEFAULT ARRAY['ADMIN','DISPATCHER','TECHNICIAN']::"Role"[],
  ADD COLUMN IF NOT EXISTS "edit_roles" "Role"[] NOT NULL
    DEFAULT ARRAY['ADMIN','DISPATCHER','TECHNICIAN']::"Role"[],
  ADD COLUMN IF NOT EXISTS "required_roles" "Role"[] NOT NULL
    DEFAULT '{}'::"Role"[];

-- Carry over the legacy boolean: required=true ⇒ required for every role
UPDATE "template_fields"
  SET "required_roles" = ARRAY['ADMIN','DISPATCHER','TECHNICIAN']::"Role"[]
  WHERE "required" = true
    AND "required_roles" = '{}'::"Role"[];

ALTER TABLE "template_fields" DROP COLUMN IF EXISTS "required";
