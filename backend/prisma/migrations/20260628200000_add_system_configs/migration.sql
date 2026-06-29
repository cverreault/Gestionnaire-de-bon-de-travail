-- ──────────────────────────────────────────────────────────────────────────
-- system_configs (SA.1.b).
--
-- Runtime overrides of what would otherwise live in .env. Secrets are
-- AES-GCM encrypted with CONFIG_MASTER_KEY from the env.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE "system_configs" (
    "key"        TEXT NOT NULL,
    "value"      TEXT NOT NULL,
    "encrypted"  BOOLEAN NOT NULL DEFAULT false,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("key")
);
