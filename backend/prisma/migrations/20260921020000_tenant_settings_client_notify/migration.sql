-- B48 — réglages d'entreprise (courriel des travaux complétés, adresse de départ) et
-- option par client « courriel à la fin des travaux ».

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "completed_jobs_email" TEXT;
ALTER TABLE "tenants" ADD COLUMN "base_address" TEXT;
ALTER TABLE "tenants" ADD COLUMN "base_lat" DOUBLE PRECISION;
ALTER TABLE "tenants" ADD COLUMN "base_lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "notify_on_completion" BOOLEAN NOT NULL DEFAULT false;
