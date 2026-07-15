-- Global Vietnamese administrative reference data from Decision 19/2025/QĐ-TTg.
-- These tables deliberately have no tenant_id and no RLS policy.

CREATE TYPE "administrative_province_type" AS ENUM ('province', 'municipality');
CREATE TYPE "administrative_ward_type" AS ENUM ('ward', 'commune', 'special_zone');

CREATE TABLE "administrative_provinces" (
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "administrative_province_type" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "administrative_provinces_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "administrative_wards" (
    "code" CHAR(5) NOT NULL,
    "province_code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "administrative_ward_type" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "administrative_wards_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "administrative_provinces_sort_order_idx"
  ON "administrative_provinces"("sort_order");
CREATE INDEX "administrative_wards_province_code_sort_order_idx"
  ON "administrative_wards"("province_code", "sort_order");

ALTER TABLE "administrative_wards"
  ADD CONSTRAINT "administrative_wards_province_code_fkey"
  FOREIGN KEY ("province_code") REFERENCES "administrative_provinces"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Runtime pools only need to read this catalog. The migration/seed owner writes it.
REVOKE INSERT, UPDATE, DELETE ON TABLE "administrative_provinces", "administrative_wards"
  FROM app_user, app_admin;
GRANT SELECT ON TABLE "administrative_provinces", "administrative_wards"
  TO app_user, app_admin;
