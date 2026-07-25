-- Listing types gain an uploaded icon image (presign publicUrl), stored alongside
-- the existing lucide `icon` name. Nullable TEXT; the app prefers this over `icon`
-- when set. listing_types already enforces RLS (tenant_isolation), so adding a
-- column needs no policy change.

ALTER TABLE "listing_types"
  ADD COLUMN "icon_image_url" TEXT;
