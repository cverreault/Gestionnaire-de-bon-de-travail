-- B46 — localisation obligatoire dans l'app mobile, gérée par l'admin par utilisateur.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "location_required" BOOLEAN NOT NULL DEFAULT true;
