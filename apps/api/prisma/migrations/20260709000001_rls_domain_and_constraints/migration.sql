-- Hand-written migration for everything Prisma cannot express on the full §7
-- data model (companion to 20260709000000_full_domain_model):
--   1. Re-assert DML grants to app_user / app_admin on the new tables.
--   2. FORCE ROW LEVEL SECURITY + tenant_isolation policy on every table that
--      carries a tenant_id column (§6.2). The USING expression doubles as the
--      INSERT WITH CHECK, so a tenant can neither read nor write another
--      tenant's rows. The CI coverage test fails the build if one is missed.
--   3. The tstzrange GiST EXCLUDE constraint that hard-guarantees no double
--      booking on an exclusive resource (§10).
--   4. Ledger integrity: one-sided entries, append-only, and a deferred
--      debit=credit-per-journal balance check (§13).

-- ── 1. Grants (idempotent; ALTER DEFAULT PRIVILEGES from the first RLS
--       migration already covers new tables, re-asserted here for safety) ──────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, app_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_admin;

-- ── 2. Row Level Security ────────────────────────────────────────────────────
-- Convention (copied from 20260708000001): every tenant_id table gets
-- ENABLE + FORCE RLS + a tenant_isolation policy keyed on the app.tenant_id GUC.

DO $$
DECLARE
  t text;
  -- Strictly tenant-scoped tables: tenant_id is NOT NULL, one clean policy.
  scoped text[] := ARRAY[
    'agreement_acceptances',
    'partners',
    'partner_members',
    'listing_types',
    'listing_groups',
    'resources',
    'listings',
    'pricing_rules',
    'categories',
    'availability_rules',
    'availability_exceptions',
    'bookings',
    'booking_holds',
    'booking_status_history',
    'cancellation_policies',
    'payments',
    'refunds',
    'tenant_gateway_configs',
    'commission_rules',
    'ledger_accounts',
    'ledger_entries',
    'payouts',
    'promotions',
    'promo_redemptions',
    'affiliates',
    'referral_links',
    'referral_clicks',
    'affiliate_commissions',
    'staff',
    'staff_availability',
    'listing_staff',
    'class_sessions'
  ];
BEGIN
  FOREACH t IN ARRAY scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'')::uuid)',
      t
    );
  END LOOP;
END
$$;

-- notification_logs: tenant_id is nullable (platform-wide rows exist). Tenant
-- rows are isolated; platform rows (tenant_id IS NULL) are reachable only via
-- the app_admin BYPASSRLS pool — same shape as outbox_events / audit_logs.
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_logs
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── 3. Double-booking exclusion constraint (§10) ─────────────────────────────
-- Locked by RESOURCE (not listing): multiple listings selling the same resource
-- share one calendar. blocked_period = timeslot expanded by the snapshotted
-- buffer. inventory/class use their own atomic counting instead of a calendar lock.
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    resource_id    WITH =,
    blocked_period WITH &&
  )
  WHERE (status IN ('pending_payment', 'pending_approval', 'confirmed')
         AND booking_mode NOT IN ('inventory', 'class'));

-- ── 4. Ledger integrity (§13) ────────────────────────────────────────────────
-- Exactly one of debit/credit is positive on every line.
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_one_sided
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0));

-- Append-only: a mistake is corrected with a reversing entry, never edited/deleted.
CREATE OR REPLACE FUNCTION ledger_entries_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only (% is not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_no_mutation
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_append_only();

-- Deferred balance check: within each journal_id, total debit = total credit.
-- DEFERRABLE INITIALLY DEFERRED so all lines of a journal can be inserted in any
-- order inside one transaction and are validated together at commit.
CREATE OR REPLACE FUNCTION ledger_journal_balanced() RETURNS trigger AS $$
DECLARE
  imbalance bigint;
BEGIN
  SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO imbalance
    FROM ledger_entries
   WHERE journal_id = NEW.journal_id;
  IF imbalance <> 0 THEN
    RAISE EXCEPTION 'ledger journal % is unbalanced by % (debit - credit)', NEW.journal_id, imbalance;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_journal_balance_check
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_journal_balanced();
