-- B14 — 2FA/TOTP support on User.
--
-- Only ADMIN + SUPER_ADMIN users are prompted to enable 2FA in the UI, but
-- the columns live on every User so any role can opt in.

ALTER TABLE "users"
    ADD COLUMN "totp_secret"              TEXT,
    ADD COLUMN "totp_enabled"             BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "totp_backup_codes_hash"   TEXT,
    ADD COLUMN "totp_enabled_at"          TIMESTAMP(3);
