-- B40 — Référentiel géographique (module geo) : rôle d'évaluation foncière
-- géoréférencé (MAMH, CC-BY 4.0). Tables plateforme-wide, chargées par
-- scripts/geo/import-role.py (COPY), lecture seule côté application.

-- CreateTable
CREATE TABLE "municipalities" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roll_year" INTEGER NOT NULL,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "land_use_codes" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "land_use_codes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "property_units" (
    "id_provinc" TEXT NOT NULL,
    "address_seq" INTEGER NOT NULL,
    "code_mun" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "civic_number" INTEGER,
    "civic_suffix" TEXT,
    "civic_number_end" INTEGER,
    "street_generic" TEXT,
    "street_link" TEXT,
    "street_name" TEXT NOT NULL,
    "street_norm" TEXT NOT NULL,
    "orientation" TEXT,
    "unit_number" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "land_use_code" TEXT,
    "year_built" INTEGER,
    "storeys" INTEGER,
    "dwellings" INTEGER,
    "land_area_m2" DOUBLE PRECISION,
    "floor_area_m2" DOUBLE PRECISION,
    "value_land" INTEGER,
    "value_building" INTEGER,
    "value_total" INTEGER,
    "lot_numbers" TEXT,
    "roll_year" INTEGER NOT NULL,

    CONSTRAINT "property_units_pkey" PRIMARY KEY ("id_provinc","address_seq")
);

-- CreateIndex
CREATE INDEX "idx_property_units_lat_lng" ON "property_units"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "idx_property_units_mun_street_num" ON "property_units"("code_mun", "street_norm", "civic_number");
