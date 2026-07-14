CREATE TYPE "listing_structure" AS ENUM ('standalone', 'grouped', 'flexible');

ALTER TABLE "listing_types"
  ADD COLUMN "structure" "listing_structure" NOT NULL DEFAULT 'standalone',
  ADD COLUMN "item_label" TEXT;
