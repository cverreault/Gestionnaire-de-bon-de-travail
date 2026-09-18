-- B40.2 — provenance du géocodage et fiche propriété (rôle d'évaluation) enregistrées
-- directement sur l'adresse, remplies au géocodage (clients) et par le balayage (dispatch-map).
ALTER TABLE "client_addresses"
  ADD COLUMN "geocoded_at" TIMESTAMP(3),
  ADD COLUMN "geocode_source" TEXT,
  ADD COLUMN "property_matched_at" TIMESTAMP(3),
  ADD COLUMN "property_matched_by" TEXT,
  ADD COLUMN "property_matricule" TEXT,
  ADD COLUMN "property_municipality" TEXT,
  ADD COLUMN "property_address" TEXT,
  ADD COLUMN "property_land_use_code" TEXT,
  ADD COLUMN "property_land_use_label" TEXT,
  ADD COLUMN "property_dwellings" INTEGER,
  ADD COLUMN "property_storeys" INTEGER,
  ADD COLUMN "property_year_built" INTEGER,
  ADD COLUMN "property_land_area_m2" DOUBLE PRECISION,
  ADD COLUMN "property_floor_area_m2" DOUBLE PRECISION,
  ADD COLUMN "property_lot_numbers" TEXT,
  ADD COLUMN "property_value_land" DOUBLE PRECISION,
  ADD COLUMN "property_value_building" DOUBLE PRECISION,
  ADD COLUMN "property_value_total" DOUBLE PRECISION,
  ADD COLUMN "property_roll_year" INTEGER;
