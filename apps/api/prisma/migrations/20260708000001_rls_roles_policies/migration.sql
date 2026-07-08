-- Hand-written migration (Prisma cannot express any of this):
--   1. app_user / app_admin database roles (TONG-QUAN.md §6.3)
--   2. FORCE ROW LEVEL SECURITY + tenant_isolation policies (§6.2)
--   3. NULLS NOT DISTINCT uniqueness for role_assignments (§7.1)
--
-- Dev passwords only — production roles are provisioned outside migrations
-- with real credentials.

-- ── 1. Database roles ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user_dev_pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin LOGIN PASSWORD 'app_admin_dev_pw' BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user, app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, app_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user, app_admin;

-- Prisma's migration bookkeeping table must stay reachable for `migrate deploy`
GRANT SELECT ON "_prisma_migrations" TO app_user, app_admin;

-- ── 2. Row Level Security ────────────────────────────────────────────────────
-- Convention: every table carrying a tenant_id column gets FORCE RLS + a
-- policy. The CI coverage test (test/rls-coverage.integration.spec.ts) fails
-- the build if a future table forgets this.

-- tenant_domains: strictly tenant-scoped
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_domains
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- tenant_subscriptions: strictly tenant-scoped
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_subscriptions
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- roles: a tenant sees its own roles plus system-wide shared roles
-- (tenant_id IS NULL) that are not platform-scope
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON roles
  USING (
    tenant_id = current_setting('app.tenant_id')::uuid
    OR (tenant_id IS NULL AND scope_level <> 'platform')
  );

-- role_assignments: tenant-scoped; platform assignments (tenant_id IS NULL)
-- are only reachable through the app_admin connection
ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_assignments
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- outbox_events: written inside tenant transactions; the relay worker reads
-- cross-tenant through app_admin
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outbox_events
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- audit_logs: tenant reads its own trail; platform rows via app_admin only
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── 3. Constraints Prisma cannot express ─────────────────────────────────────
CREATE UNIQUE INDEX role_assignments_user_role_scope_key
  ON role_assignments (user_id, role_id, tenant_id, partner_id)
  NULLS NOT DISTINCT;
