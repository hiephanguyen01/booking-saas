-- Promotion discovery is opt-in: existing/private codes must never become public after deploy.
-- The table is already FORCE RLS protected; this adds no new tenant-scoped relation.

ALTER TABLE "promotions"
ADD COLUMN "storefront_visible" BOOLEAN NOT NULL DEFAULT false;
