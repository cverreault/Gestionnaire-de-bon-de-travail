-- B49 — kilométrage aller-retour d'un bon de travail (calculé par le moteur de routage ou saisi).

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN "travel_distance_km" DOUBLE PRECISION;
ALTER TABLE "work_orders" ADD COLUMN "travel_duration_min" DOUBLE PRECISION;
ALTER TABLE "work_orders" ADD COLUMN "travel_source" TEXT;
ALTER TABLE "work_orders" ADD COLUMN "travel_computed_at" TIMESTAMP(3);
