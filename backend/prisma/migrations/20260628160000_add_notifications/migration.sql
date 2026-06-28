-- ──────────────────────────────────────────────────────────────────────────
-- Notifications (B1.1).
--
-- DB row is the source of truth — channels (email, web push, in-app) are
-- delivery side-effects. Listener creates the row on event reception;
-- channel adapters update channelsSent + sentAt when they succeed.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE "notifications" (
    "id"            TEXT NOT NULL,
    "user_id"       TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "body"          TEXT,
    "aggregate_id"  TEXT,
    "data"          JSONB,
    "status"        TEXT NOT NULL DEFAULT 'PENDING',
    "channels_sent" JSONB,
    "sent_at"       TIMESTAMP(3),
    "read_at"       TIMESTAMP(3),
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Inbox queries: WHERE user_id = ? ORDER BY read_at NULLS FIRST, created_at DESC
CREATE INDEX "idx_notifications_inbox"
    ON "notifications"("user_id", "read_at", "created_at" DESC);

-- Background retries scan PENDING/FAILED rows.
CREATE INDEX "idx_notifications_status"
    ON "notifications"("status", "created_at");
