-- Effective-dated household revenue thresholds plus the tenant-scoped facts
-- used to evaluate them. Legal rules are global; partner revenue/declarations
-- are tenant data and therefore FORCE RLS.

CREATE TYPE "partner_tax_assessment_status" AS ENUM (
  'missing_declaration',
  'below_threshold',
  'exceeded',
  'manual_review'
);

CREATE TYPE "partner_tax_classification_source" AS ENUM (
  'automatic_threshold',
  'external_declaration',
  'manual_override',
  'legal_rule'
);

CREATE TYPE "partner_tax_revenue_source" AS ENUM (
  'settlement_release',
  'settlement_clawback',
  'backfill_adjustment'
);

CREATE TABLE "tax_threshold_rules" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "threshold_amount" BIGINT NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_to" TIMESTAMPTZ(6),
  "published_at" TIMESTAMPTZ(6) NOT NULL,
  "legal_ref" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_threshold_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_threshold_rules_code_effective_from_revision_key"
    UNIQUE ("code", "effective_from", "revision"),
  CONSTRAINT "tax_threshold_rules_amount_check" CHECK ("threshold_amount" >= 0),
  CONSTRAINT "tax_threshold_rules_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "tax_threshold_rules_window_check"
    CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE INDEX "tax_threshold_rules_code_is_active_effective_from_idx"
  ON "tax_threshold_rules" ("code", "is_active", "effective_from");

CREATE TABLE "partner_tax_year_assessments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "tax_year" INTEGER NOT NULL,
  "status" "partner_tax_assessment_status" NOT NULL DEFAULT 'missing_declaration',
  "platform_revenue" BIGINT NOT NULL DEFAULT 0,
  "external_revenue" BIGINT NOT NULL DEFAULT 0,
  "threshold_amount" BIGINT NOT NULL,
  "threshold_rule_id" UUID NOT NULL,
  "crossed_at" TIMESTAMPTZ(6),
  "crossed_quarter" INTEGER,
  "classification_source" "partner_tax_classification_source" NOT NULL DEFAULT 'automatic_threshold',
  "manual_override_status" "partner_tax_status",
  "manual_override_reason" TEXT,
  "manual_override_by" UUID,
  "manual_override_until" TIMESTAMPTZ(6),
  "declaration_updated_at" TIMESTAMPTZ(6),
  "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_tax_year_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_tax_year_assessments_tenant_partner_year_key"
    UNIQUE ("tenant_id", "partner_id", "tax_year"),
  CONSTRAINT "partner_tax_year_assessments_year_check" CHECK ("tax_year" BETWEEN 2000 AND 2200),
  CONSTRAINT "partner_tax_year_assessments_revenue_check"
    CHECK ("platform_revenue" >= 0 AND "external_revenue" >= 0 AND "threshold_amount" >= 0),
  CONSTRAINT "partner_tax_year_assessments_quarter_check"
    CHECK ("crossed_quarter" IS NULL OR "crossed_quarter" BETWEEN 1 AND 4),
  CONSTRAINT "partner_tax_year_assessments_version_check" CHECK ("version" > 0),
  CONSTRAINT "partner_tax_year_assessments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "partner_tax_year_assessments_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "partner_tax_year_assessments_threshold_rule_id_fkey"
    FOREIGN KEY ("threshold_rule_id") REFERENCES "tax_threshold_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "partner_tax_year_assessments_tenant_year_status_idx"
  ON "partner_tax_year_assessments" ("tenant_id", "tax_year", "status");
CREATE INDEX "partner_tax_year_assessments_partner_year_idx"
  ON "partner_tax_year_assessments" ("partner_id", "tax_year");

CREATE TABLE "partner_tax_revenue_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "source_type" "partner_tax_revenue_source" NOT NULL,
  "source_id" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "service_date" TIMESTAMPTZ(6) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_tax_revenue_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_tax_revenue_events_tenant_source_key"
    UNIQUE ("tenant_id", "source_type", "source_id"),
  CONSTRAINT "partner_tax_revenue_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "partner_tax_revenue_events_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "partner_tax_revenue_events_assessment_id_fkey"
    FOREIGN KEY ("assessment_id") REFERENCES "partner_tax_year_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "partner_tax_revenue_events_tenant_partner_service_date_idx"
  ON "partner_tax_revenue_events" ("tenant_id", "partner_id", "service_date");
CREATE INDEX "partner_tax_revenue_events_assessment_created_at_idx"
  ON "partner_tax_revenue_events" ("assessment_id", "created_at");

CREATE TABLE "partner_tax_declarations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "external_revenue" BIGINT NOT NULL,
  "declared_by_user_id" UUID NOT NULL,
  "note" TEXT,
  "declared_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_tax_declarations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_tax_declarations_revenue_check" CHECK ("external_revenue" >= 0),
  CONSTRAINT "partner_tax_declarations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "partner_tax_declarations_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "partner_tax_declarations_assessment_id_fkey"
    FOREIGN KEY ("assessment_id") REFERENCES "partner_tax_year_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "partner_tax_declarations_tenant_partner_declared_at_idx"
  ON "partner_tax_declarations" ("tenant_id", "partner_id", "declared_at");
CREATE INDEX "partner_tax_declarations_assessment_declared_at_idx"
  ON "partner_tax_declarations" ("assessment_id", "declared_at");

ALTER TABLE "partner_tax_year_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_tax_year_assessments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "partner_tax_year_assessments"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE "partner_tax_revenue_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_tax_revenue_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "partner_tax_revenue_events"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE "partner_tax_declarations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_tax_declarations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "partner_tax_declarations"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT ON "tax_threshold_rules" TO app_user, app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "partner_tax_year_assessments",
  "partner_tax_revenue_events",
  "partner_tax_declarations"
TO app_user, app_admin;
