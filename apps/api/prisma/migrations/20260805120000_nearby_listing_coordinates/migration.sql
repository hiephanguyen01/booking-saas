-- Distance search uses PostgreSQL's built-in contrib extensions. `cube` must
-- be installed first because `earthdistance`'s ll_to_earth representation is a cube.
CREATE EXTENSION IF NOT EXISTS "cube";
CREATE EXTENSION IF NOT EXISTS "earthdistance";

ALTER TABLE "listing_groups"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

ALTER TABLE "listings"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

ALTER TABLE "listing_groups"
  ADD CONSTRAINT "listing_groups_coordinates_pair_check"
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT "listing_groups_latitude_range_check"
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT "listing_groups_longitude_range_check"
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

ALTER TABLE "listings"
  ADD CONSTRAINT "listings_coordinates_pair_check"
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT "listings_latitude_range_check"
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT "listings_longitude_range_check"
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

-- K-nearest-neighbour indexes cover only public cards with a complete point.
CREATE INDEX "listing_groups_published_location_gist"
  ON "listing_groups" USING GIST (ll_to_earth(latitude, longitude))
  WHERE status = 'published' AND latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX "listings_published_standalone_location_gist"
  ON "listings" USING GIST (ll_to_earth(latitude, longitude))
  WHERE status = 'published' AND group_id IS NULL
    AND latitude IS NOT NULL AND longitude IS NOT NULL;
