-- Partner-owned cancellation policies + tenant/partner default fallback (§11.3).
-- Hand-written migration (see docs/decisions/0004-hand-written-migrations.md).
--
-- cancellation_policies.partner_id:  NULL ⇒ tenant-level shared policy (original behaviour);
--                                    set  ⇒ owned by that partner (partner self-service CRUD).
-- tenants/partners.default_cancellation_policy_id: fallback chain used when a listing sets no policy:
--   listing.cancellation_policy_id ?? partner.default ?? tenant.default.
-- All columns are nullable → additive, no backfill. RLS is unchanged: cancellation_policies still
-- carries tenant_id so the existing tenant_isolation policy covers it; partner scoping is app-layer.

-- ── Partner ownership on cancellation_policies ───────────────────────────────
ALTER TABLE "cancellation_policies" ADD COLUMN "partner_id" UUID;

ALTER TABLE "cancellation_policies"
  ADD CONSTRAINT "cancellation_policies_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "cancellation_policies_partner_id_idx" ON "cancellation_policies"("partner_id");

-- ── Tenant-level fallback default ────────────────────────────────────────────
ALTER TABLE "tenants" ADD COLUMN "default_cancellation_policy_id" UUID;

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_default_cancellation_policy_id_fkey"
  FOREIGN KEY ("default_cancellation_policy_id") REFERENCES "cancellation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Partner-level fallback default ───────────────────────────────────────────
ALTER TABLE "partners" ADD COLUMN "default_cancellation_policy_id" UUID;

ALTER TABLE "partners"
  ADD CONSTRAINT "partners_default_cancellation_policy_id_fkey"
  FOREIGN KEY ("default_cancellation_policy_id") REFERENCES "cancellation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "partners_default_cancellation_policy_id_idx" ON "partners"("default_cancellation_policy_id");
