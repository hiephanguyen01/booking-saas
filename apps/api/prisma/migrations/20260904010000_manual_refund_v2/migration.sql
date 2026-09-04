-- Durable batch-level maker/checker workflow for provider-neutral manual refunds.

CREATE TYPE "manual_refund_operation_status" AS ENUM (
  'awaiting_details',
  'verification_required',
  'correction_required',
  'ready_for_transfer',
  'transfer_submitted',
  'transfer_rejected',
  'completed'
);

CREATE TYPE "manual_refund_customer_acknowledgement" AS ENUM (
  'received',
  'not_received'
);

-- Required by the composite FK below: an operation's tenant must be the batch's tenant.
CREATE UNIQUE INDEX "refund_batches_tenant_id_id_key"
  ON "refund_batches"("tenant_id", "id");

CREATE TABLE "manual_refund_operations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "refund_batch_id" UUID NOT NULL,
  "status" "manual_refund_operation_status" NOT NULL DEFAULT 'awaiting_details',
  "version" INTEGER NOT NULL DEFAULT 1,
  "destination_bank_code" TEXT,
  "destination_account_name" TEXT,
  "destination_account_last4" TEXT,
  "destination_account_ciphertext" TEXT,
  "destination_encryption_key_version" TEXT,
  "destination_account_fingerprint" TEXT,
  "destination_is_third_party" BOOLEAN NOT NULL DEFAULT false,
  "destination_consent_at" TIMESTAMPTZ(6),
  "destination_submitted_at" TIMESTAMPTZ(6),
  "verification_result" TEXT,
  "verification_method" TEXT,
  "verified_by_user_id" UUID,
  "verified_at" TIMESTAMPTZ(6),
  "maker_user_id" UUID,
  "claimed_at" TIMESTAMPTZ(6),
  "reassigned_by_user_id" UUID,
  "reassignment_reason" TEXT,
  "reassigned_at" TIMESTAMPTZ(6),
  "transfer_reference" TEXT,
  "transfer_reference_normalized" TEXT,
  "evidence_object_key" TEXT,
  "evidence_content_type" TEXT,
  "evidence_size_bytes" INTEGER,
  "evidence_sha256" TEXT,
  "evidence_verified_at" TIMESTAMPTZ(6),
  "transfer_submitted_by_user_id" UUID,
  "transfer_submitted_at" TIMESTAMPTZ(6),
  "checked_by_user_id" UUID,
  "checked_at" TIMESTAMPTZ(6),
  "rejection_reason" TEXT,
  "reopened_by_user_id" UUID,
  "reopen_reason" TEXT,
  "reopened_at" TIMESTAMPTZ(6),
  "ready_at" TIMESTAMPTZ(6),
  "transfer_due_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "customer_acknowledgement" "manual_refund_customer_acknowledgement",
  "customer_acknowledged_at" TIMESTAMPTZ(6),
  "customer_acknowledgement_note" TEXT,
  "ciphertext_purged_at" TIMESTAMPTZ(6),
  "break_glass_by_user_id" UUID,
  "break_glass_reason" TEXT,
  "break_glass_authenticated_at" TIMESTAMPTZ(6),
  "break_glass_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "manual_refund_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manual_refund_operations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "manual_refund_operations_tenant_id_refund_batch_id_fkey"
    FOREIGN KEY ("tenant_id", "refund_batch_id")
    REFERENCES "refund_batches"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "manual_refund_operations_version_check" CHECK ("version" > 0),
  CONSTRAINT "manual_refund_operations_destination_last4_check"
    CHECK ("destination_account_last4" IS NULL OR "destination_account_last4" ~ '^[0-9]{4}$'),
  CONSTRAINT "manual_refund_operations_destination_fingerprint_check"
    CHECK ("destination_account_fingerprint" IS NULL OR "destination_account_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "manual_refund_operations_destination_bundle_check" CHECK (
    ("destination_account_ciphertext" IS NULL
      AND "destination_encryption_key_version" IS NULL
      AND "destination_account_fingerprint" IS NULL
      AND "destination_account_last4" IS NULL)
    OR
    ("destination_account_ciphertext" IS NOT NULL
      AND "destination_encryption_key_version" IS NOT NULL
      AND "destination_account_fingerprint" IS NOT NULL
      AND "destination_account_last4" IS NOT NULL
      AND "destination_bank_code" IS NOT NULL
      AND "destination_account_name" IS NOT NULL
      AND "destination_submitted_at" IS NOT NULL)
  ),
  CONSTRAINT "manual_refund_operations_third_party_consent_check" CHECK (
    "destination_is_third_party" = false OR "destination_consent_at" IS NOT NULL
  ),
  CONSTRAINT "manual_refund_operations_verification_result_check"
    CHECK ("verification_result" IS NULL OR "verification_result" IN ('matched','mismatch','unsupported','error')),
  CONSTRAINT "manual_refund_operations_verification_method_check"
    CHECK ("verification_method" IS NULL OR "verification_method" IN ('lookup','manual')),
  CONSTRAINT "manual_refund_operations_transfer_reference_bundle_check" CHECK (
    ("transfer_reference" IS NULL) = ("transfer_reference_normalized" IS NULL)
  ),
  CONSTRAINT "manual_refund_operations_evidence_size_check"
    CHECK ("evidence_size_bytes" IS NULL OR "evidence_size_bytes" BETWEEN 1 AND 10485760),
  CONSTRAINT "manual_refund_operations_evidence_content_type_check"
    CHECK ("evidence_content_type" IS NULL OR "evidence_content_type" IN ('application/pdf','image/jpeg','image/png')),
  CONSTRAINT "manual_refund_operations_evidence_sha256_check"
    CHECK ("evidence_sha256" IS NULL OR "evidence_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "manual_refund_operations_evidence_bundle_check" CHECK (
    ("evidence_object_key" IS NULL
      AND "evidence_content_type" IS NULL
      AND "evidence_size_bytes" IS NULL
      AND "evidence_sha256" IS NULL
      AND "evidence_verified_at" IS NULL)
    OR
    ("evidence_object_key" IS NOT NULL
      AND "evidence_content_type" IS NOT NULL
      AND "evidence_size_bytes" IS NOT NULL
      AND "evidence_sha256" IS NOT NULL
      AND "evidence_verified_at" IS NOT NULL)
  ),
  CONSTRAINT "manual_refund_operations_acknowledgement_bundle_check" CHECK (
    ("customer_acknowledgement" IS NULL) = ("customer_acknowledged_at" IS NULL)
  ),
  CONSTRAINT "manual_refund_operations_reassignment_bundle_check" CHECK (
    ("reassigned_by_user_id" IS NULL
      AND "reassignment_reason" IS NULL
      AND "reassigned_at" IS NULL)
    OR
    ("reassigned_by_user_id" IS NOT NULL
      AND length(btrim("reassignment_reason")) >= 3
      AND "reassigned_at" IS NOT NULL)
  ),
  CONSTRAINT "manual_refund_operations_reopen_bundle_check" CHECK (
    ("reopened_by_user_id" IS NULL
      AND "reopen_reason" IS NULL
      AND "reopened_at" IS NULL)
    OR
    ("reopened_by_user_id" IS NOT NULL
      AND length(btrim("reopen_reason")) >= 3
      AND "reopened_at" IS NOT NULL)
  ),
  CONSTRAINT "manual_refund_operations_transfer_state_prerequisites_check" CHECK (
    "status" NOT IN ('transfer_submitted', 'transfer_rejected', 'completed')
    OR
    ("destination_submitted_at" IS NOT NULL
      AND "maker_user_id" IS NOT NULL
      AND "transfer_reference" IS NOT NULL
      AND "evidence_object_key" IS NOT NULL
      AND "evidence_verified_at" IS NOT NULL
      AND "transfer_submitted_by_user_id" = "maker_user_id"
      AND "transfer_submitted_at" IS NOT NULL)
  ),
  CONSTRAINT "manual_refund_operations_completion_checker_check" CHECK (
    "status" <> 'completed'
    OR
    (("checked_by_user_id" IS NOT NULL
        AND "checked_at" IS NOT NULL
        AND "checked_by_user_id" <> "maker_user_id")
      OR
      ("break_glass_by_user_id" IS NOT NULL
        AND "break_glass_by_user_id" <> "maker_user_id"))
  ),
  CONSTRAINT "manual_refund_operations_break_glass_bundle_check" CHECK (
    ("break_glass_by_user_id" IS NULL
      AND "break_glass_reason" IS NULL
      AND "break_glass_authenticated_at" IS NULL
      AND "break_glass_at" IS NULL)
    OR
    ("break_glass_by_user_id" IS NOT NULL
      AND length(btrim("break_glass_reason")) >= 10
      AND "break_glass_authenticated_at" IS NOT NULL
      AND "break_glass_at" IS NOT NULL
      AND "break_glass_authenticated_at" <= "break_glass_at"
      AND "break_glass_authenticated_at" >= "break_glass_at" - INTERVAL '5 minutes')
  )
);

CREATE UNIQUE INDEX "manual_refund_operations_refund_batch_id_key"
  ON "manual_refund_operations"("refund_batch_id");
CREATE UNIQUE INDEX "manual_refund_operations_tenant_id_refund_batch_id_key"
  ON "manual_refund_operations"("tenant_id", "refund_batch_id");
CREATE UNIQUE INDEX "manual_refund_operations_tenant_transfer_reference_key"
  ON "manual_refund_operations"("tenant_id", "transfer_reference_normalized")
  WHERE "transfer_reference_normalized" IS NOT NULL;
CREATE INDEX "manual_refund_operations_tenant_id_status_updated_at_idx"
  ON "manual_refund_operations"("tenant_id", "status", "updated_at");
CREATE INDEX "manual_refund_operations_tenant_id_maker_user_id_status_idx"
  ON "manual_refund_operations"("tenant_id", "maker_user_id", "status");
CREATE INDEX "manual_refund_operations_tenant_id_transfer_due_at_idx"
  ON "manual_refund_operations"("tenant_id", "transfer_due_at");

ALTER TABLE "manual_refund_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manual_refund_operations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "manual_refund_operations"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "manual_refund_operations" TO app_user, app_admin;

-- Opt-in only. Existing child refunds and batches stay manual_required; this creates
-- the new customer-detail workflow without asserting that money has moved.
INSERT INTO "manual_refund_operations" (
  "id", "tenant_id", "refund_batch_id", "status", "version", "created_at", "updated_at"
)
SELECT gen_random_uuid(), rb."tenant_id", rb."id", 'awaiting_details', 1,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "refund_batches" rb
JOIN "tenants" t ON t."id" = rb."tenant_id"
WHERE rb."status" = 'manual_required'::"refund_batch_status"
  AND COALESCE(t."settings" ->> 'manual_refund_v2', 'false') = 'true'
ON CONFLICT ("refund_batch_id") DO NOTHING;
