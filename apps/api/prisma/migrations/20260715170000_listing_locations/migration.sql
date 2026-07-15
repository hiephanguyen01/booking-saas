-- Canonical two-level Vietnamese addresses for listing groups and listings.
-- Columns are nullable so existing tenant records remain readable; all new
-- records are required to provide a validated address by the API contract.

ALTER TABLE "listing_groups"
  ADD COLUMN "province_code" CHAR(2),
  ADD COLUMN "province_name" TEXT,
  ADD COLUMN "ward_code" CHAR(5),
  ADD COLUMN "ward_name" TEXT;

ALTER TABLE "listings"
  ADD COLUMN "province_code" CHAR(2),
  ADD COLUMN "province_name" TEXT,
  ADD COLUMN "ward_code" CHAR(5),
  ADD COLUMN "ward_name" TEXT,
  ADD COLUMN "address" TEXT;

CREATE INDEX "listing_groups_tenant_id_province_code_ward_code_idx"
  ON "listing_groups"("tenant_id", "province_code", "ward_code");

CREATE INDEX "listings_tenant_id_province_code_ward_code_idx"
  ON "listings"("tenant_id", "province_code", "ward_code");
