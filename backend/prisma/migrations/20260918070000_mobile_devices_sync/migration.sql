-- B37.2 — App mobile : appareils, clés d'idempotence, appareil sur les refresh tokens,
-- source des positions GPS, index du pull de sync (ADR-015, ADR-016, ADR-017).

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');
CREATE TYPE "PushProvider" AS ENUM ('EXPO', 'FCM', 'APNS');
CREATE TYPE "LocationSource" AS ENUM ('WEB', 'MOBILE_FOREGROUND', 'MOBILE_BACKGROUND');

-- AlterTable: technician_locations
ALTER TABLE "technician_locations" ADD COLUMN "source" "LocationSource" NOT NULL DEFAULT 'WEB';
CREATE UNIQUE INDEX "uq_technician_locations_tech_recorded" ON "technician_locations"("technician_id", "recorded_at");

-- AlterTable: refresh_tokens
ALTER TABLE "refresh_tokens" ADD COLUMN "device_id" TEXT;
CREATE INDEX "idx_refresh_tokens_device" ON "refresh_tokens"("device_id");

-- work_orders: sync pull cursor
CREATE INDEX "idx_work_orders_sync_pull" ON "work_orders"("tenant_id", "assigned_to_id", "updated_at");

-- CreateTable: devices
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "installation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "provider" "PushProvider" NOT NULL DEFAULT 'EXPO',
    "push_token" TEXT,
    "push_token_invalidated_at" TIMESTAMP(3),
    "app_version" TEXT NOT NULL,
    "os_version" TEXT,
    "model" TEXT,
    "locale" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "devices_push_token_key" ON "devices"("push_token");
CREATE UNIQUE INDEX "uq_devices_tenant_installation" ON "devices"("tenant_id", "installation_id");
CREATE INDEX "idx_devices_user" ON "devices"("user_id");
CREATE INDEX "idx_devices_tenant_id" ON "devices"("tenant_id");
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: idempotency_keys
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "status_code" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_idempotency_tenant_user_key" ON "idempotency_keys"("tenant_id", "user_id", "key");
CREATE INDEX "idx_idempotency_created_at" ON "idempotency_keys"("created_at");
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
