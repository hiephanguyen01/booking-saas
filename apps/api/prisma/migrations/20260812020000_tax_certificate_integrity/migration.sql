-- Enforce the immutable artifact metadata expected by issuance/download code.

ALTER TABLE "tax_withholding_certificates"
  ADD CONSTRAINT "tax_certificates_amounts_check"
    CHECK ("vat_amount" >= 0 AND "pit_amount" >= 0),
  ADD CONSTRAINT "tax_certificates_checksum_check"
    CHECK ("checksum" IS NULL OR "checksum" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "tax_certificates_supersedes_self_check"
    CHECK ("supersedes_id" IS NULL OR "supersedes_id" <> "id"),
  ADD CONSTRAINT "tax_certificates_issued_document_check" CHECK (
    "status" = 'draft' OR (
      "certificate_number" IS NOT NULL
      AND length(btrim("certificate_number")) BETWEEN 1 AND 100
      AND "file_key" IS NOT NULL
      AND "checksum" IS NOT NULL
      AND "issued_at" IS NOT NULL
      AND "issued_by" IS NOT NULL
    )
  );
