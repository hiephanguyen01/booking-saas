-- Immutable tax-certificate versions, server-tracked private uploads and a
-- complete void/reissue audit trail.

CREATE TYPE "tax_document_upload_status" AS ENUM ('pending', 'attached', 'expired');

CREATE TABLE "tax_document_uploads" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "checksum" CHAR(64) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "content_type" TEXT NOT NULL,
  "status" "tax_document_upload_status" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "attached_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_document_uploads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_document_uploads_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_document_uploads_checksum_check"
    CHECK ("checksum" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "tax_document_uploads_size_check"
    CHECK ("size_bytes" BETWEEN 1 AND 10485760),
  CONSTRAINT "tax_document_uploads_content_type_check"
    CHECK ("content_type" = 'application/pdf'),
  CONSTRAINT "tax_document_uploads_state_check" CHECK (
    ("status" = 'pending' AND "attached_at" IS NULL AND "deleted_at" IS NULL) OR
    ("status" = 'attached' AND "attached_at" IS NOT NULL AND "deleted_at" IS NULL) OR
    ("status" = 'expired' AND "attached_at" IS NULL)
  )
);

CREATE UNIQUE INDEX "tax_document_uploads_tenant_key_key"
  ON "tax_document_uploads"("tenant_id", "object_key");
CREATE INDEX "tax_document_uploads_tenant_status_expiry_idx"
  ON "tax_document_uploads"("tenant_id", "status", "expires_at");
CREATE INDEX "tax_document_uploads_cleanup_idx"
  ON "tax_document_uploads"("status", "expires_at")
  WHERE "deleted_at" IS NULL;

ALTER TABLE "tax_withholding_certificates"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supersedes_id" UUID,
  ADD COLUMN "document_upload_id" UUID,
  ADD COLUMN "voided_at" TIMESTAMPTZ(6),
  ADD COLUMN "voided_by" UUID,
  ADD COLUMN "void_reason" TEXT;

DROP INDEX "tax_certificates_tenant_partner_year_key";

ALTER TABLE "tax_withholding_certificates"
  ADD CONSTRAINT "tax_certificates_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "tax_certificates_void_state_check" CHECK (
    ("status" = 'voided' AND "voided_at" IS NOT NULL AND "voided_by" IS NOT NULL
      AND length(btrim("void_reason")) BETWEEN 10 AND 500) OR
    ("status" <> 'voided' AND "voided_at" IS NULL AND "voided_by" IS NULL
      AND "void_reason" IS NULL)
  ),
  ADD CONSTRAINT "tax_certificates_supersedes_id_fkey"
    FOREIGN KEY ("supersedes_id") REFERENCES "tax_withholding_certificates"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "tax_certificates_document_upload_id_fkey"
    FOREIGN KEY ("document_upload_id") REFERENCES "tax_document_uploads"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "tax_certificates_tenant_partner_year_version_key"
  ON "tax_withholding_certificates"("tenant_id", "partner_id", "tax_year", "version");
CREATE UNIQUE INDEX "tax_certificates_one_active_issued_key"
  ON "tax_withholding_certificates"("tenant_id", "partner_id", "tax_year")
  WHERE "status" = 'issued';
CREATE UNIQUE INDEX "tax_certificates_number_key"
  ON "tax_withholding_certificates"("tenant_id", "certificate_number")
  WHERE "certificate_number" IS NOT NULL;
CREATE UNIQUE INDEX "tax_certificates_file_key_key"
  ON "tax_withholding_certificates"("tenant_id", "file_key")
  WHERE "file_key" IS NOT NULL;
CREATE UNIQUE INDEX "tax_certificates_document_upload_id_key"
  ON "tax_withholding_certificates"("document_upload_id")
  WHERE "document_upload_id" IS NOT NULL;

ALTER TABLE "tax_document_uploads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_document_uploads" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_document_uploads"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE ON "tax_document_uploads" TO app_user, app_admin;
