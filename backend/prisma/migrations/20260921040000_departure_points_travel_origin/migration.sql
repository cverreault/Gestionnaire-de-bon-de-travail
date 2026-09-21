-- B49.2 — points de départ prédéfinis par entreprise ; origine et mode (aller simple / aller-retour)
-- du kilométrage stockés sur le BT ; plus d'adresse de base unique sur le tenant.

-- CreateTable
CREATE TABLE "departure_points" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "departure_points_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_departure_points_tenant_id" ON "departure_points"("tenant_id");
ALTER TABLE "departure_points" ADD CONSTRAINT "departure_points_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise de l'ancienne adresse de base comme premier point de départ
INSERT INTO "departure_points" ("id", "tenant_id", "label", "address", "lat", "lng", "sort_order")
SELECT gen_random_uuid()::text, "id", 'Entreprise', "base_address", "base_lat", "base_lng", 0
FROM "tenants" WHERE "base_address" IS NOT NULL AND "base_lat" IS NOT NULL AND "base_lng" IS NOT NULL;

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "base_address";
ALTER TABLE "tenants" DROP COLUMN "base_lat";
ALTER TABLE "tenants" DROP COLUMN "base_lng";

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN "travel_origin_label" TEXT;
ALTER TABLE "work_orders" ADD COLUMN "travel_origin_lat" DOUBLE PRECISION;
ALTER TABLE "work_orders" ADD COLUMN "travel_origin_lng" DOUBLE PRECISION;
ALTER TABLE "work_orders" ADD COLUMN "travel_round_trip" BOOLEAN NOT NULL DEFAULT true;
