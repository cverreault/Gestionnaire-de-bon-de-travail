-- Add apartment/unit field to client addresses
ALTER TABLE "client_addresses" ADD COLUMN IF NOT EXISTS "apartment" TEXT;
