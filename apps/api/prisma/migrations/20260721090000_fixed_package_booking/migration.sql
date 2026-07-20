CREATE TYPE "booking_selection" AS ENUM ('flexible_duration', 'fixed_packages');

ALTER TABLE "listing_types"
  ADD COLUMN "booking_selection" "booking_selection" NOT NULL DEFAULT 'flexible_duration';
