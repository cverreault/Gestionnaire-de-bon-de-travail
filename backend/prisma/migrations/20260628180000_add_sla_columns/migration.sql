-- ──────────────────────────────────────────────────────────────────────────
-- SLA tracking (B4).
--
-- task_types.sla_hours configures the SLA per type (null = no SLA).
-- work_orders.sla_target_at is computed once at create time and stays
-- immutable. work_orders.sla_breached_at is set by the nightly cron when
-- a BT is still active past its target.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE "task_types"
    ADD COLUMN "sla_hours" INTEGER;

ALTER TABLE "work_orders"
    ADD COLUMN "sla_target_at"   TIMESTAMP(3),
    ADD COLUMN "sla_breached_at" TIMESTAMP(3);

-- Cron scans the rows whose target has passed but breach hasn't been set yet.
CREATE INDEX "idx_work_orders_sla_pending"
    ON "work_orders"("sla_target_at", "sla_breached_at");
