-- B40.3 — journal des imports du rôle d'évaluation (portail super-admin).
CREATE TABLE "geo_import_jobs" (
    "id" TEXT NOT NULL,
    "roll_year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "triggered_by_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "rows_imported" INTEGER,
    "log" TEXT NOT NULL DEFAULT '',
    "error" TEXT,

    CONSTRAINT "geo_import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_geo_import_jobs_started_at" ON "geo_import_jobs"("started_at");
