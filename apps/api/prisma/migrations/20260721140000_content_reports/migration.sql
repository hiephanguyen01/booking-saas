CREATE TYPE "content_report_target" AS ENUM ('listing', 'group');
CREATE TYPE "content_report_reason" AS ENUM (
  'misleading',
  'fraud_or_scam',
  'prohibited_content',
  'contact_or_off_platform',
  'duplicate_or_spam',
  'other'
);
CREATE TYPE "content_report_status" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

CREATE TABLE "content_reports" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "reporter_user_id" UUID,
  "reporter_name" TEXT NOT NULL,
  "partner_id" UUID,
  "partner_name" TEXT NOT NULL,
  "target_type" "content_report_target" NOT NULL,
  "target_id" UUID NOT NULL,
  "target_title" TEXT NOT NULL,
  "target_slug" TEXT NOT NULL,
  "reason" "content_report_reason" NOT NULL,
  "details" TEXT,
  "status" "content_report_status" NOT NULL DEFAULT 'open',
  "handled_by_user_id" UUID,
  "resolution_note" TEXT,
  "handled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "content_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "content_reports_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "content_reports_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "content_reports_tenant_id_status_created_at_idx"
  ON "content_reports"("tenant_id", "status", "created_at" DESC);
CREATE INDEX "content_reports_tenant_id_target_type_target_id_idx"
  ON "content_reports"("tenant_id", "target_type", "target_id");
CREATE INDEX "content_reports_reporter_user_id_created_at_idx"
  ON "content_reports"("reporter_user_id", "created_at" DESC);
CREATE UNIQUE INDEX "content_reports_active_reporter_target_key"
  ON "content_reports"("tenant_id", "reporter_user_id", "target_type", "target_id")
  WHERE "reporter_user_id" IS NOT NULL AND "status" IN ('open', 'reviewing');

ALTER TABLE "content_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_reports" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "content_reports"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "content_reports" TO app_user, app_admin;
