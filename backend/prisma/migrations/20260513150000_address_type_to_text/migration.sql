-- Loosen ClientAddress.addressType from the Prisma enum (OFFICE/WAREHOUSE/
-- RESIDENCE/WORKSITE) to a free string. The source of truth becomes
-- AddressTypeConfig.code, which is admin-configurable from /parametres.
--
-- This unblocks custom types (CAMP, MARINA, etc.) used by ClientAddress.
-- Existing enum values are preserved as-is (Postgres serializes enums as
-- their text label).

ALTER TABLE "client_addresses"
  ALTER COLUMN "address_type" DROP DEFAULT;

ALTER TABLE "client_addresses"
  ALTER COLUMN "address_type" TYPE TEXT USING "address_type"::TEXT;

ALTER TABLE "client_addresses"
  ALTER COLUMN "address_type" SET DEFAULT 'RESIDENCE';

-- The enum type itself is left in place (still used by `clientType` and any
-- legacy code paths). It can be dropped in a later cleanup migration.

-- Ensure the 4 defaults exist so users have something to pick from in dropdowns.
INSERT INTO "address_type_configs" (id, name, code, description, color, icon, "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Bureau',    'OFFICE',    'Adresse de bureau ou de siège social',    '#3b82f6', '🖥️', true, 0, NOW(), NOW()),
  (gen_random_uuid()::text, 'Entrepôt',  'WAREHOUSE', 'Site de stockage ou dépôt de marchandises','#f59e0b', '📦', true, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'Résidence', 'RESIDENCE', 'Domicile ou adresse personnelle du client','#10b981', '🏡', true, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'Chantier',  'WORKSITE',  'Site d''intervention ou chantier temporaire','#ef4444','🔧', true, 3, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
