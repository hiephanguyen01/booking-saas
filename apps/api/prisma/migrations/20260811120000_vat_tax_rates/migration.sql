-- Dynamic VAT (§VAT). Three moving parts:
--   1. `tax_rates` — the national VAT schedule. GLOBAL on purpose: no tenant_id,
--      therefore no RLS policy and none required by check:rls. The 2% reduction
--      (NQ 204/2025/QH15) lapsing on 2026-12-31 must be one row edit, not a
--      fan-out across every tenant's rows.
--   2. `listing_types.tax_category` — the tenant classifies WHAT it sells.
--   3. `partners.tax_status` / `tenants.tax_status` — WHO sells decides whether
--      output VAT applies at all (<=200M VND/year households are exempt).

CREATE TYPE "tax_category" AS ENUM (
  'standard',
  'reduced_5',
  'exempt',
  'not_taxable'
);

CREATE TYPE "partner_tax_status" AS ENUM (
  'company_vat',
  'household_declaring',
  'household_below_threshold',
  'individual'
);

CREATE TABLE "tax_rates" (
  "id" UUID NOT NULL,
  "category" "tax_category" NOT NULL,
  "rate_bps" INTEGER NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_to" TIMESTAMPTZ(6),
  "legal_ref" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_rates_category_effective_from_key" UNIQUE ("category", "effective_from"),
  CONSTRAINT "tax_rates_rate_bps_range_check" CHECK ("rate_bps" >= 0 AND "rate_bps" <= 10000),
  CONSTRAINT "tax_rates_effective_window_check"
    CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE INDEX "tax_rates_category_effective_from_idx"
  ON "tax_rates" ("category", "effective_from");

-- Reference data the app only ever reads; writes go through the migrate/seed
-- connection, which bypasses these grants.
GRANT SELECT ON "tax_rates" TO app_user, app_admin;

ALTER TABLE "listing_types"
  ADD COLUMN "tax_category" "tax_category" NOT NULL DEFAULT 'standard';

-- Defaults chosen so that turning the feature on moves no money: a partner is
-- assumed VAT-exempt until a tenant says otherwise, while a tenant (which pays
-- for a subscription and invoices commission) is assumed to be a VAT company.
ALTER TABLE "partners"
  ADD COLUMN "tax_status" "partner_tax_status" NOT NULL DEFAULT 'household_below_threshold';

ALTER TABLE "tenants"
  ADD COLUMN "tax_status" "partner_tax_status" NOT NULL DEFAULT 'company_vat';
