-- B45 — position du client (mobile) au moment de chaque action, sur les événements d'audit.

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "location" JSONB;
