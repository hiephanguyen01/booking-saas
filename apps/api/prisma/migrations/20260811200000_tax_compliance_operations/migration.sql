-- Completion-time partner tax withholding, tax-authority liability accounting,
-- monthly filing/remittance workflow and annual certificate metadata.

ALTER TYPE "ledger_owner_type" ADD VALUE IF NOT EXISTS 'tax_authority';
ALTER TYPE "ledger_entry_type" ADD VALUE IF NOT EXISTS 'vat_remitted';
ALTER TYPE "ledger_entry_type" ADD VALUE IF NOT EXISTS 'pit_remitted';

CREATE TYPE "tax_withholding_event_type" AS ENUM ('withholding', 'reversal');
CREATE TYPE "tax_filing_status" AS ENUM ('draft', 'submitted', 'paid');
CREATE TYPE "tax_certificate_status" AS ENUM ('draft', 'issued', 'voided');

ALTER TABLE "booking_settlements"
  ADD COLUMN "withholding_journal_id" UUID;

CREATE UNIQUE INDEX "booking_settlements_withholding_journal_id_key"
  ON "booking_settlements"("withholding_journal_id");

CREATE TABLE "tax_filing_periods" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "tax_year" INTEGER NOT NULL,
  "tax_month" INTEGER NOT NULL,
  "status" "tax_filing_status" NOT NULL DEFAULT 'draft',
  "taxable_revenue" BIGINT NOT NULL DEFAULT 0,
  "vat_amount" BIGINT NOT NULL DEFAULT 0,
  "pit_amount" BIGINT NOT NULL DEFAULT 0,
  "prepared_by" UUID NOT NULL,
  "submitted_by" UUID,
  "submission_reference" TEXT,
  "submitted_at" TIMESTAMPTZ(6),
  "paid_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tax_filing_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_filing_periods_month_check" CHECK ("tax_month" BETWEEN 1 AND 12),
  CONSTRAINT "tax_filing_periods_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "tax_filing_periods_tenant_id_tax_year_tax_month_key"
  ON "tax_filing_periods"("tenant_id", "tax_year", "tax_month");
CREATE INDEX "tax_filing_periods_tenant_id_status_idx"
  ON "tax_filing_periods"("tenant_id", "status");

CREATE TABLE "tax_withholding_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "settlement_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "event_type" "tax_withholding_event_type" NOT NULL,
  "source_key" TEXT NOT NULL,
  "original_event_id" UUID,
  "taxable_revenue" BIGINT NOT NULL,
  "vat_amount" BIGINT NOT NULL,
  "pit_amount" BIGINT NOT NULL,
  "journal_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "filing_period_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_withholding_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_withholding_events_amount_check" CHECK (
    "taxable_revenue" >= 0 AND "vat_amount" >= 0 AND "pit_amount" >= 0
  ),
  CONSTRAINT "tax_withholding_events_original_check" CHECK (
    ("event_type" = 'withholding' AND "original_event_id" IS NULL) OR
    ("event_type" = 'reversal' AND "original_event_id" IS NOT NULL)
  ),
  CONSTRAINT "tax_withholding_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_withholding_events_settlement_id_fkey"
    FOREIGN KEY ("settlement_id") REFERENCES "booking_settlements"("id") ON DELETE RESTRICT,
  CONSTRAINT "tax_withholding_events_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT,
  CONSTRAINT "tax_withholding_events_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT,
  CONSTRAINT "tax_withholding_events_original_event_id_fkey"
    FOREIGN KEY ("original_event_id") REFERENCES "tax_withholding_events"("id") ON DELETE RESTRICT,
  CONSTRAINT "tax_withholding_events_filing_period_id_fkey"
    FOREIGN KEY ("filing_period_id") REFERENCES "tax_filing_periods"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "tax_withholding_events_tenant_id_source_key_key"
  ON "tax_withholding_events"("tenant_id", "source_key");
CREATE INDEX "tax_withholding_events_tenant_id_occurred_at_idx"
  ON "tax_withholding_events"("tenant_id", "occurred_at");
CREATE INDEX "tax_withholding_events_partner_id_occurred_at_idx"
  ON "tax_withholding_events"("partner_id", "occurred_at");
CREATE INDEX "tax_withholding_events_filing_period_id_idx"
  ON "tax_withholding_events"("filing_period_id");

CREATE TABLE "tax_remittances" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "filing_period_id" UUID NOT NULL,
  "vat_amount" BIGINT NOT NULL,
  "pit_amount" BIGINT NOT NULL,
  "payment_reference" TEXT NOT NULL,
  "evidence" JSONB,
  "journal_id" UUID NOT NULL,
  "paid_at" TIMESTAMPTZ(6) NOT NULL,
  "recorded_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_remittances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_remittances_amount_check" CHECK (
    "vat_amount" >= 0 AND "pit_amount" >= 0 AND ("vat_amount" + "pit_amount") > 0
  ),
  CONSTRAINT "tax_remittances_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_remittances_filing_period_id_fkey"
    FOREIGN KEY ("filing_period_id") REFERENCES "tax_filing_periods"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "tax_remittances_journal_id_key" ON "tax_remittances"("journal_id");
CREATE UNIQUE INDEX "tax_remittances_tenant_period_reference_key"
  ON "tax_remittances"("tenant_id", "filing_period_id", "payment_reference");
CREATE INDEX "tax_remittances_tenant_id_paid_at_idx"
  ON "tax_remittances"("tenant_id", "paid_at");

CREATE TABLE "tax_withholding_certificates" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "tax_year" INTEGER NOT NULL,
  "status" "tax_certificate_status" NOT NULL DEFAULT 'draft',
  "certificate_number" TEXT,
  "vat_amount" BIGINT NOT NULL DEFAULT 0,
  "pit_amount" BIGINT NOT NULL DEFAULT 0,
  "file_key" TEXT,
  "checksum" TEXT,
  "issued_at" TIMESTAMPTZ(6),
  "issued_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tax_withholding_certificates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_withholding_certificates_amount_check" CHECK (
    "vat_amount" >= 0 AND "pit_amount" >= 0
  ),
  CONSTRAINT "tax_withholding_certificates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_withholding_certificates_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "tax_certificates_tenant_partner_year_key"
  ON "tax_withholding_certificates"("tenant_id", "partner_id", "tax_year");
CREATE INDEX "tax_certificates_tenant_year_status_idx"
  ON "tax_withholding_certificates"("tenant_id", "tax_year", "status");

ALTER TABLE "tax_withholding_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_withholding_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_withholding_events"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE "tax_filing_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_filing_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_filing_periods"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE "tax_remittances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_remittances" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_remittances"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE "tax_withholding_certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_withholding_certificates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_withholding_certificates"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE ON "tax_withholding_events" TO app_user, app_admin;
GRANT SELECT, INSERT, UPDATE ON "tax_filing_periods" TO app_user, app_admin;
GRANT SELECT, INSERT ON "tax_remittances" TO app_user, app_admin;
GRANT SELECT, INSERT, UPDATE ON "tax_withholding_certificates" TO app_user, app_admin;

-- Withholding amounts are immutable. Assignment to one filing period is the
-- only permitted update and cannot be changed once set.
CREATE OR REPLACE FUNCTION protect_tax_withholding_event() RETURNS trigger AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.settlement_id IS DISTINCT FROM NEW.settlement_id
     OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
     OR OLD.partner_id IS DISTINCT FROM NEW.partner_id
     OR OLD.event_type IS DISTINCT FROM NEW.event_type
     OR OLD.source_key IS DISTINCT FROM NEW.source_key
     OR OLD.original_event_id IS DISTINCT FROM NEW.original_event_id
     OR OLD.taxable_revenue IS DISTINCT FROM NEW.taxable_revenue
     OR OLD.vat_amount IS DISTINCT FROM NEW.vat_amount
     OR OLD.pit_amount IS DISTINCT FROM NEW.pit_amount
     OR OLD.journal_id IS DISTINCT FROM NEW.journal_id
     OR OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR (OLD.filing_period_id IS NOT NULL AND OLD.filing_period_id IS DISTINCT FROM NEW.filing_period_id)
  THEN
    RAISE EXCEPTION 'tax withholding events are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_withholding_event_immutable
  BEFORE UPDATE ON "tax_withholding_events"
  FOR EACH ROW EXECUTE FUNCTION protect_tax_withholding_event();

CREATE OR REPLACE FUNCTION reject_tax_withholding_event_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'tax withholding events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_withholding_event_no_delete
  BEFORE DELETE ON "tax_withholding_events"
  FOR EACH ROW EXECUTE FUNCTION reject_tax_withholding_event_delete();
