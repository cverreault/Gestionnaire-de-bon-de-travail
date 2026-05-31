-- Per-user UI preferences (column layouts, hidden filters, etc.) stored as JSONB.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" JSONB;
