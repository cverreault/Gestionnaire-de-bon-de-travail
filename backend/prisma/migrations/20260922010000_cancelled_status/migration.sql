-- B54 — statut « Annulé » : valeur d'enum + drapeau de statut de processus.
-- Les statuts/transitions « Annulé » sont ajoutés à chaque processus existant
-- au démarrage par ProcessSeedService.backfillCancelledStatus (idempotent).
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TABLE "process_statuses" ADD COLUMN IF NOT EXISTS "is_cancelled" BOOLEAN NOT NULL DEFAULT false;
