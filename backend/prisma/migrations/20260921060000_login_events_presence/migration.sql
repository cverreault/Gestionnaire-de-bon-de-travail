-- B51 — historique des connexions (IP, appareil, date) et présence (dernière activité).

-- CreateTable
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "device_id" TEXT,
    "family" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_login_events_tenant_created" ON "login_events"("tenant_id", "created_at" DESC);
CREATE INDEX "idx_login_events_user_created" ON "login_events"("user_id", "created_at" DESC);
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "last_seen_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "last_seen_ip" TEXT;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "ip" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "user_agent" TEXT;
