-- B10 — Alert rules.
-- Configurable per-tenant rules that fan a domain event out to notifications
-- through the existing notifications module.

CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    -- Trigger
    "event_name" TEXT NOT NULL,
    "process_definition_id" TEXT,
    "from_status_id" TEXT,
    "to_status_id" TEXT,
    "task_type_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority_in" TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Recipients
    "recipient_roles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "recipient_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipient_assigned_technician" BOOLEAN NOT NULL DEFAULT false,
    "recipient_client" BOOLEAN NOT NULL DEFAULT false,

    -- Channels
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Templates
    "title_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "client_title_template" TEXT,
    "client_body_template" TEXT,

    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_alert_rules_tenant_active" ON "alert_rules"("tenant_id", "is_active");
CREATE INDEX "idx_alert_rules_tenant_event"  ON "alert_rules"("tenant_id", "event_name");

ALTER TABLE "alert_rules"
    ADD CONSTRAINT "alert_rules_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
