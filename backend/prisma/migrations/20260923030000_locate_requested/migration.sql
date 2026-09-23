-- B65 — demande de position en attente (répondue par la sync quand le push n'est pas disponible).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locate_requested_at" TIMESTAMP(3);
