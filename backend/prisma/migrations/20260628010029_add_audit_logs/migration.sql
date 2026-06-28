-- ──────────────────────────────────────────────────────────────────────────
-- Audit module : trace immuable des domain events (ADR-007 / plan §B2)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE "audit_logs" (
    "id"             TEXT NOT NULL,
    "event_name"     TEXT NOT NULL,
    "aggregate_id"   TEXT NOT NULL,
    "occurred_at"    TIMESTAMP(3) NOT NULL,
    "actor_user_id"  TEXT,
    "data"           JSONB,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Index pour récupérer rapidement la timeline d'un agrégat
CREATE INDEX "idx_audit_logs_aggregate_recent"
    ON "audit_logs"("aggregate_id", "occurred_at" DESC);

-- Index pour filtrer par type d'event
CREATE INDEX "idx_audit_logs_event_recent"
    ON "audit_logs"("event_name", "occurred_at" DESC);

-- Index pour audit "qui a fait quoi"
CREATE INDEX "idx_audit_logs_actor_recent"
    ON "audit_logs"("actor_user_id", "occurred_at" DESC);
