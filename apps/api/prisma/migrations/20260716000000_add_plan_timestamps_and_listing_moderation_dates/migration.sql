-- Plan timestamps + listing moderation lifecycle dates.
--
-- 1. `subscription_plans` was the only model without created_at/updated_at.
--    It is a PLATFORM-level table (no tenant_id) and therefore has no RLS
--    policy by design — see 20260708000001_rls_roles_policies, which only
--    enables RLS on tenant-scoped tables. Nothing to add here.
-- 2. `listings` already has FORCE RLS + a tenant_isolation policy, so adding
--    nullable columns needs no new RLS migration (same reasoning as
--    20260709000004_inventory_fulfillment_columns).

-- created_at keeps its DEFAULT (Prisma @default(now())).
-- updated_at is application-managed (Prisma @updatedAt) and carries no default
-- in the schema, so the default below exists only to backfill the pre-existing
-- rows and is dropped immediately after — leaving DDL identical to what Prisma
-- emits for a fresh table (cf. "tenant_subscriptions" in the init migration).
ALTER TABLE "subscription_plans"
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "subscription_plans"
  ALTER COLUMN "updated_at" DROP DEFAULT;

-- Moderation lifecycle: draft -> (submitted_at) pending_review -> (published_at)
-- published. Nullable: existing listings have no recorded submit/publish moment
-- and must not be back-dated to the migration timestamp.
ALTER TABLE "listings"
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN "published_at" TIMESTAMPTZ(6);
