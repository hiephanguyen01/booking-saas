ALTER TABLE "listing_types"
ADD COLUMN "search_config" JSONB NOT NULL DEFAULT '{}'::jsonb;
