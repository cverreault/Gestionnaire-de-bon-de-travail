-- B7.5 — Per-tenant branding: optional MinIO object key for the tenant logo.
-- Additive + nullable: existing tenants keep NULL (UI falls back to the
-- generic TaskMgr mark). No backfill required.
ALTER TABLE "tenants" ADD COLUMN "logo_storage_key" TEXT;
