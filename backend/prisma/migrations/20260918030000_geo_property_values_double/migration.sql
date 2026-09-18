-- B40 — les valeurs au rôle dépassent 2^31 $ pour certains immeubles (ex. 2 265 653 300).
-- INTEGER → DOUBLE PRECISION (exact jusqu'à 2^53, côté API un `number`).
ALTER TABLE "property_units"
  ALTER COLUMN "value_land" TYPE DOUBLE PRECISION,
  ALTER COLUMN "value_building" TYPE DOUBLE PRECISION,
  ALTER COLUMN "value_total" TYPE DOUBLE PRECISION;
