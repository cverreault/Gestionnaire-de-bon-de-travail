-- B63 — adresse LAN conservée à côté de l'IP publique rapportée par le client.
ALTER TABLE "login_events" ADD COLUMN IF NOT EXISTS "lan_ip" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_lan_ip" TEXT;
