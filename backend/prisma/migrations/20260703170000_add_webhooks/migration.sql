-- B9 — Outbound webhooks (event subscriptions).
-- One row per registered receiver in `webhook_endpoints`.
-- One row per delivery attempt log in `webhook_deliveries` (append-only:
-- retries UPDATE the SAME row, they never insert a new one).

CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "secret_prefix" TEXT NOT NULL,
    "subscribed_events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "disabled_reason" TEXT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_webhook_endpoints_tenant_id" ON "webhook_endpoints"("tenant_id");
CREATE INDEX "idx_webhook_endpoints_tenant_active" ON "webhook_endpoints"("tenant_id", "is_active");

ALTER TABLE "webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "last_response_status" INTEGER,
    "last_response_body_excerpt" TEXT,
    "last_error" TEXT,
    "first_attempted_at" TIMESTAMP(3),
    "last_attempted_at" TIMESTAMP(3),
    "succeeded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_webhook_deliveries_status_next_retry"
    ON "webhook_deliveries"("status", "next_retry_at");
CREATE INDEX "idx_webhook_deliveries_endpoint_created"
    ON "webhook_deliveries"("endpoint_id", "created_at" DESC);

ALTER TABLE "webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey"
    FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
