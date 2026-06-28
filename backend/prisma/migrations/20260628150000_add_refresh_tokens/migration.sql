-- ──────────────────────────────────────────────────────────────────────────
-- Auth : refresh tokens DB-backed avec rotation + détection de replay (C6)
--
-- Remplace le `Map<refreshToken, userId>` en mémoire de AuthService.
-- Chaque login démarre une nouvelle `family` (UUID). Chaque refresh révoque
-- l'ancien token et émet un nouveau de la même famille. Si un token déjà
-- révoqué est rejoué → toute la famille est invalidée.
--
-- Seul le SHA-256 du JWT est stocké, jamais le JWT brut.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE "refresh_tokens" (
    "id"          TEXT NOT NULL,
    "token_hash"  TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "family"      TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"  TIMESTAMP(3) NOT NULL,
    "revoked_at"  TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key"
    ON "refresh_tokens"("token_hash");

CREATE INDEX "idx_refresh_tokens_user"
    ON "refresh_tokens"("user_id");

CREATE INDEX "idx_refresh_tokens_family"
    ON "refresh_tokens"("family");

CREATE INDEX "idx_refresh_tokens_expires"
    ON "refresh_tokens"("expires_at");
