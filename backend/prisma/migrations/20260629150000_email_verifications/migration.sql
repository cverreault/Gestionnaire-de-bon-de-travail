-- B6.8 — Email verification (soft)
--
-- Adds a nullable verified_at column on users + a token table that
-- backs the /verify-email endpoint. The verification is "soft" :
-- the account works regardless, the frontend simply shows a
-- "vérifie ton email" banner until verified_at is non-null.

ALTER TABLE "users"
  ADD COLUMN "email_verified_at" TIMESTAMP(3);

CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verifications_token_hash_key"
  ON "email_verifications" ("token_hash");

CREATE INDEX "idx_email_verifications_user_id"
  ON "email_verifications" ("user_id");

ALTER TABLE "email_verifications"
  ADD CONSTRAINT "email_verifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
