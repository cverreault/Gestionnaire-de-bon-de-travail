-- B26 — per-user 2FA brute-force lockout counters.
ALTER TABLE "users" ADD COLUMN "totp_failed_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "totp_locked_until" TIMESTAMP(3);
