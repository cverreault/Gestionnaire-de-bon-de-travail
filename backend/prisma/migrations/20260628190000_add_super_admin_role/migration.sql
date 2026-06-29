-- ──────────────────────────────────────────────────────────────────────────
-- SUPER_ADMIN role (SA foundation).
--
-- Platform-level role that inherits every ADMIN privilege and gains the
-- ability to manage global system configs + tenants (when B6 lands).
-- Bootstrapped via SUPER_ADMIN_EMAIL env on boot.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN' BEFORE 'ADMIN';
