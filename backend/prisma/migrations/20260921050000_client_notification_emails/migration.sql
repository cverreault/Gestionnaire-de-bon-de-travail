-- B48.2 — plusieurs courriels de notification par client (fin de travaux), à la place de la case unique.

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "notification_emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Reprise : les clients cochés reçoivent sur leur courriel principal
UPDATE "clients" SET "notification_emails" = ARRAY["email"] WHERE "notify_on_completion" = true AND "email" IS NOT NULL AND "email" <> '';

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "notify_on_completion";
