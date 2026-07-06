-- B15 — Work-order reminders (SMS + email + in-app).

CREATE TABLE "wo_reminders" (
    "id"                  TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL,
    "work_order_id"       TEXT NOT NULL,
    "send_at"             TIMESTAMP(3) NOT NULL,
    "channels"            TEXT[] DEFAULT ARRAY[]::TEXT[],
    "body_template"       TEXT,
    "status"              TEXT NOT NULL DEFAULT 'pending',
    "sent_at"             TIMESTAMP(3),
    "error_message"       TEXT,
    "created_by_user_id"  TEXT,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wo_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_wo_reminders_status_send_at" ON "wo_reminders"("status", "send_at");
CREATE INDEX "idx_wo_reminders_wo_id"          ON "wo_reminders"("work_order_id");
CREATE INDEX "idx_wo_reminders_tenant_id"      ON "wo_reminders"("tenant_id");

ALTER TABLE "wo_reminders"
    ADD CONSTRAINT "wo_reminders_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wo_reminders"
    ADD CONSTRAINT "wo_reminders_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
