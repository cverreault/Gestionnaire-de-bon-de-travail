-- B8 — Public API authentication keys
--
-- Machine-to-machine access to `/api/v1/*`. The plaintext key
-- (`tkm_<env>_<32-b64url>`) is shown ONCE at creation; only the SHA-256
-- hash lives here. Revocation is soft — the row stays for audit and
-- to display a "revoked at" state in the admin UI.

CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "idx_api_keys_tenant_id" ON "api_keys"("tenant_id");
CREATE INDEX "idx_api_keys_key_hash" ON "api_keys"("key_hash");

ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
