ALTER TABLE "manual_refund_operations"
  DROP CONSTRAINT "manual_refund_operations_destination_bundle_check";

ALTER TABLE "manual_refund_operations"
  ADD CONSTRAINT "manual_refund_operations_destination_bundle_check" CHECK (
    ("destination_account_ciphertext" IS NULL
      AND "destination_encryption_key_version" IS NULL
      AND "destination_account_fingerprint" IS NULL
      AND "destination_account_last4" IS NULL
      AND "ciphertext_purged_at" IS NULL)
    OR
    ("destination_account_ciphertext" IS NOT NULL
      AND "destination_encryption_key_version" IS NOT NULL
      AND "destination_account_fingerprint" IS NOT NULL
      AND "destination_account_last4" IS NOT NULL
      AND "destination_bank_code" IS NOT NULL
      AND "destination_account_name" IS NOT NULL
      AND "destination_submitted_at" IS NOT NULL
      AND "ciphertext_purged_at" IS NULL)
    OR
    ("destination_account_ciphertext" IS NULL
      AND "destination_encryption_key_version" IS NULL
      AND "destination_account_fingerprint" IS NOT NULL
      AND "destination_account_last4" IS NOT NULL
      AND "destination_bank_code" IS NOT NULL
      AND "destination_account_name" IS NOT NULL
      AND "destination_submitted_at" IS NOT NULL
      AND "ciphertext_purged_at" IS NOT NULL)
  );

CREATE INDEX "manual_refund_operations_ciphertext_purge_idx"
  ON "manual_refund_operations"("completed_at", "id")
  WHERE "status" = 'completed'
    AND "ciphertext_purged_at" IS NULL
    AND "destination_account_ciphertext" IS NOT NULL;
