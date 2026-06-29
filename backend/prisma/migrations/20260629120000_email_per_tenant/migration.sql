-- B6.3 — Email uniqueness becomes per-tenant
--
-- Previously: email was globally unique across the entire users table.
-- That prevents the realistic SaaS case where the same person (same
-- gmail address) has accounts at two different customers.
--
-- New shape: unique (tenant_id, email). A user is identified by the
-- (tenant, email) pair; the login flow knows the tenant from the
-- sub-domain (B6.2).

-- Existing data is safe: every row currently shares the DEFAULT tenant,
-- so dropping the global unique and creating the composite never
-- introduces a collision.
DROP INDEX "users_email_key";

CREATE UNIQUE INDEX "idx_users_tenant_email"
  ON "users" ("tenant_id", "email");

-- We keep a non-unique index on email alone for the "find user by email
-- across tenants" case the SA impersonate flow (B6.11) will need.
CREATE INDEX "idx_users_email" ON "users" ("email");
