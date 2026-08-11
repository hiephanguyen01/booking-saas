-- NĐ 117/2025: the entity with the payment function withholds VAT + PIT from a
-- household/individual seller and remits on their behalf. This is a deduction
-- from what the tenant owes the partner, never a new charge to the customer.

ALTER TYPE "ledger_entry_type" ADD VALUE IF NOT EXISTS 'vat_withheld';
ALTER TYPE "ledger_entry_type" ADD VALUE IF NOT EXISTS 'pit_withheld';

CREATE TABLE "withholding_rates" (
  "id" UUID NOT NULL,
  "activity" TEXT NOT NULL,
  "vat_bps" INTEGER NOT NULL,
  "pit_bps" INTEGER NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_to" TIMESTAMPTZ(6),
  "legal_ref" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "withholding_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "withholding_rates_activity_effective_from_key" UNIQUE ("activity", "effective_from"),
  CONSTRAINT "withholding_rates_bps_range_check"
    CHECK ("vat_bps" BETWEEN 0 AND 10000 AND "pit_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "withholding_rates_window_check"
    CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

-- Global legal reference data: applications read it; the seed connection writes it.
GRANT SELECT ON "withholding_rates" TO app_user, app_admin;

ALTER TABLE "booking_settlements"
  ADD COLUMN "partner_vat_withheld" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "partner_pit_withheld" BIGINT NOT NULL DEFAULT 0;
