-- ──────────────────────────────────────────────────────────────────────────
-- Push subscriptions (B1.3).
--
-- One row per (user, browser/device). endpoint is unique — re-subscriptions
-- replace the previous row via upsert.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE "push_subscriptions" (
    "id"           TEXT NOT NULL,
    "user_id"      TEXT NOT NULL,
    "endpoint"     TEXT NOT NULL,
    "p256dh"       TEXT NOT NULL,
    "auth"         TEXT NOT NULL,
    "user_agent"   TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key"
    ON "push_subscriptions"("endpoint");

CREATE INDEX "idx_push_subscriptions_user"
    ON "push_subscriptions"("user_id");
