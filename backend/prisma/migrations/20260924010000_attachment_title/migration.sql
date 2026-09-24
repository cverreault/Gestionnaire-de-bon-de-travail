-- B68 — nom donné par l'utilisateur à une photo / pièce jointe (modifiable).
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "title" TEXT;
