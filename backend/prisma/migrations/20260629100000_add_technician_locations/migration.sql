-- B5.1 — Technician live position time-series
--
-- Append-only table. A nightly cron prunes rows older than 7 days
-- for PIPEDA / Loi 25 compliance (TECH never opts in → no rows).
--
-- Primary access pattern: "latest position per tech" — covered by the
-- composite (technician_id, recorded_at DESC) index. A second index on
-- recorded_at alone supports the retention sweep.

CREATE TABLE "technician_locations" (
    "id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_locations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_technician_locations_tech_recorded"
  ON "technician_locations" ("technician_id", "recorded_at" DESC);

CREATE INDEX "idx_technician_locations_recorded_at"
  ON "technician_locations" ("recorded_at");

ALTER TABLE "technician_locations"
  ADD CONSTRAINT "technician_locations_technician_id_fkey"
  FOREIGN KEY ("technician_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
