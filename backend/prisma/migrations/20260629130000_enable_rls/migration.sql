-- B6.5 — Postgres Row Level Security as the second line of defence
--
-- The application middleware (B6.4) is the primary tenant filter.
-- This adds RLS so that anything that bypasses Prisma — raw SQL via
-- $queryRaw, direct psql access, future modules that forget the
-- middleware — is still gated by the DB itself.
--
-- Policy shape :
--   USING (
--     current_setting('app.tenant_id', true) IS NULL
--     OR current_setting('app.tenant_id', true) = ''
--     OR tenant_id::text = current_setting('app.tenant_id', true)
--   )
--
-- The "GUC unset" branch keeps system callers (the seeder, the SA
-- bootstrap, the retention crons) unrestricted. App requests pass
-- through PrismaService.withTenantScope(...) which sets the GUC for
-- the duration of a transaction; once inside, RLS narrows queries
-- to the matching tenant automatically.
--
-- We don't FORCE RLS for the DB owner role (taskmgr) here. Adding
-- FORCE is a follow-up that requires creating a separate app role
-- without ownership, out of scope for B6.5.

-- Helper to create + enable a policy for a single tenant-scoped table.
-- (Inline as repeated DO blocks rather than a function so each row is
-- visible in the migration diff.)

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users',
    'temporary_clients',
    'clients',
    'client_addresses',
    'task_types',
    'work_order_templates',
    'template_sections',
    'template_fields',
    'client_type_configs',
    'address_type_configs',
    'address_type_fields',
    'work_orders',
    'notes',
    'attachments',
    'appointments',
    'process_definitions',
    'process_statuses',
    'process_transitions',
    'audit_logs',
    'refresh_tokens',
    'notifications',
    'push_subscriptions',
    'technician_locations'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ('
      '  current_setting(''app.tenant_id'', true) IS NULL '
      '  OR current_setting(''app.tenant_id'', true) = '''' '
      '  OR tenant_id::text = current_setting(''app.tenant_id'', true)'
      ')',
      tbl
    );
    -- Same condition applies to INSERTs / UPDATEs so a write can't
    -- escape the active tenant scope (WITH CHECK mirrors USING).
    EXECUTE format(
      'ALTER POLICY tenant_isolation ON %I '
      'WITH CHECK ('
      '  current_setting(''app.tenant_id'', true) IS NULL '
      '  OR current_setting(''app.tenant_id'', true) = '''' '
      '  OR tenant_id::text = current_setting(''app.tenant_id'', true)'
      ')',
      tbl
    );
  END LOOP;
END $$;
