-- B11 — Recurring work orders.
-- Template BTs the system spawns on a schedule. See RecurringWorkOrder in
-- schema.prisma for the field semantics.

CREATE TABLE "recurring_work_orders" (
    "id"                     TEXT NOT NULL,
    "tenant_id"              TEXT NOT NULL,
    "name"                   TEXT NOT NULL,
    "description"            TEXT NOT NULL DEFAULT '',
    "is_active"              BOOLEAN NOT NULL DEFAULT true,

    "task_type_id"           TEXT NOT NULL,
    "client_id"              TEXT NOT NULL,
    "client_address_id"      TEXT,
    "assigned_to_id"         TEXT,
    "work_order_title"       TEXT NOT NULL DEFAULT '',
    "work_order_description" TEXT NOT NULL DEFAULT '',
    "priority"               INTEGER NOT NULL DEFAULT 0,

    "frequency"              TEXT NOT NULL,
    "interval"               INTEGER NOT NULL DEFAULT 1,
    "by_day_of_week"         INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "by_day_of_month"        INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "start_date"             TIMESTAMP(3) NOT NULL,
    "end_date"               TIMESTAMP(3),

    "next_run_at"            TIMESTAMP(3) NOT NULL,
    "last_run_at"            TIMESTAMP(3),
    "spawned_count"          INTEGER NOT NULL DEFAULT 0,

    "created_by_user_id"     TEXT NOT NULL,
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_work_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_recurring_wo_tenant_active" ON "recurring_work_orders"("tenant_id", "is_active");
CREATE INDEX "idx_recurring_wo_next_run"     ON "recurring_work_orders"("is_active", "next_run_at");

ALTER TABLE "recurring_work_orders"
    ADD CONSTRAINT "recurring_wo_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
