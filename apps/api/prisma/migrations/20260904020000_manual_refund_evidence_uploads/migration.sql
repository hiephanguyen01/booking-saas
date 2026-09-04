CREATE TABLE "manual_refund_evidence_uploads" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "content_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "claimed_at" TIMESTAMPTZ(6),
  "quarantined_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "manual_refund_evidence_uploads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manual_refund_evidence_uploads_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "manual_refund_evidence_uploads_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "manual_refund_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "manual_refund_evidence_uploads_checksum_check"
    CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "manual_refund_evidence_uploads_size_check"
    CHECK ("size_bytes" BETWEEN 1 AND 10485760),
  CONSTRAINT "manual_refund_evidence_uploads_content_type_check"
    CHECK ("content_type" IN ('application/pdf','image/jpeg','image/png')),
  CONSTRAINT "manual_refund_evidence_uploads_status_check"
    CHECK ("status" IN ('pending','claimed','quarantined')),
  CONSTRAINT "manual_refund_evidence_uploads_lifecycle_check" CHECK (
    ("status" = 'pending' AND "claimed_at" IS NULL AND "quarantined_at" IS NULL)
    OR ("status" = 'claimed' AND "claimed_at" IS NOT NULL AND "quarantined_at" IS NULL)
    OR ("status" = 'quarantined' AND "claimed_at" IS NULL AND "quarantined_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "manual_refund_evidence_uploads_tenant_id_object_key_key"
  ON "manual_refund_evidence_uploads"("tenant_id", "object_key");
CREATE INDEX "manual_refund_evidence_uploads_tenant_operation_status_expiry_idx"
  ON "manual_refund_evidence_uploads"("tenant_id", "operation_id", "status", "expires_at");

ALTER TABLE "manual_refund_evidence_uploads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manual_refund_evidence_uploads" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "manual_refund_evidence_uploads"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "manual_refund_evidence_uploads" TO app_user, app_admin;
