-- Split civic number from street name and add an optional company name on clients.
-- Both new columns are nullable so existing rows keep working.

ALTER TABLE "client_addresses"
  ADD COLUMN IF NOT EXISTS "street_number" TEXT;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "company_name" TEXT;
