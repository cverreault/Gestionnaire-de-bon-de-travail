-- B59 — fuseau horaire de l'entreprise (IANA), défaut America/Toronto.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'America/Toronto';
