-- B7.12 — Per-tenant monthly peak tracking
--
-- Bills users at the MONTHLY PEAK, not the current active count. If a tenant
-- ramped from 2 → 4 → 2 users during a month, the invoice reflects 4 seats.
-- Peaks reset naturally at the month boundary (a fresh row is INSERTed).
--
-- Storage is tracked here too so we can bill by peak GB later — for now the
-- charge is per-user but the columns don't cost anything and preserve future
-- flexibility.
--
-- Rows are UPSERTed on every counter increment via `GREATEST(existing, new)`;
-- decrements do NOT touch the peak (that's the whole point). See
-- PeakTrackerService.

CREATE TABLE "tenant_monthly_peaks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    /* Format: 'YYYY-MM' — string keeps SQL indexing dead simple and locale-independent. */
    "year_month" CHAR(7) NOT NULL,
    "max_users" INTEGER NOT NULL DEFAULT 0,
    "max_clients" INTEGER NOT NULL DEFAULT 0,
    "max_work_orders_this_month" INTEGER NOT NULL DEFAULT 0,
    "max_storage_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_monthly_peaks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_monthly_peaks_tenant_month_key"
    ON "tenant_monthly_peaks"("tenant_id", "year_month");

CREATE INDEX "idx_tenant_monthly_peaks_year_month"
    ON "tenant_monthly_peaks"("year_month");

ALTER TABLE "tenant_monthly_peaks"
    ADD CONSTRAINT "tenant_monthly_peaks_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: for every existing tenant, initialise the CURRENT month's peak with
-- the ACTUAL row counts (not the `tenants.current_*` bookkeeping columns,
-- which are known to drift on legacy installs). Without this, a running
-- month reads 0 for its peaks until the next counter change — that would
-- under-bill until then.
INSERT INTO "tenant_monthly_peaks" (
    "id", "tenant_id", "year_month",
    "max_users", "max_clients", "max_work_orders_this_month", "max_storage_bytes",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    t.id,
    to_char(CURRENT_TIMESTAMP, 'YYYY-MM'),
    COALESCE((SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.is_active = true), 0),
    COALESCE((SELECT count(*) FROM clients c WHERE c.tenant_id = t.id), 0),
    COALESCE(
      (SELECT count(*) FROM work_orders w
       WHERE w.tenant_id = t.id
         AND w.created_at >= date_trunc('month', CURRENT_TIMESTAMP)),
      0
    ),
    t.current_storage_bytes,
    NOW()
FROM "tenants" t;
