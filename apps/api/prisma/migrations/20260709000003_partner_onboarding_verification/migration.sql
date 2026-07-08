-- Task 1.2 — Partner onboarding & verification.
-- Adds identity-verification state to partners (manual review, §7.3) and a
-- people-booking flag to listing_types (the type gate consumed by Task 1.3/1.4).
-- partners + listing_types already have FORCE RLS + tenant_isolation policies —
-- adding columns to a policied table needs no new RLS migration.

CREATE TYPE "partner_verification_status" AS ENUM ('unsubmitted', 'pending', 'verified', 'rejected');

ALTER TABLE "partners"
  ADD COLUMN "verification_status" "partner_verification_status" NOT NULL DEFAULT 'unsubmitted',
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "identity_info" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "listing_types"
  ADD COLUMN "requires_identity_verification" BOOLEAN NOT NULL DEFAULT false;
