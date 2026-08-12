-- Which surface a hostname serves. Existing rows are all storefront hosts.
CREATE TYPE "tenant_domain_kind" AS ENUM ('storefront', 'dashboard');

ALTER TABLE "tenant_domains"
  ADD COLUMN "kind" "tenant_domain_kind" NOT NULL DEFAULT 'storefront';

-- A tenant now has one primary per surface, not one primary overall.
DROP INDEX IF EXISTS "tenant_domains_one_primary_per_tenant_key";
CREATE UNIQUE INDEX "tenant_domains_one_primary_per_tenant_key"
  ON "tenant_domains" ("tenant_id", "kind")
  WHERE "is_primary";

CREATE INDEX "tenant_domains_kind_idx" ON "tenant_domains" ("kind");

-- Backfill: every existing tenant gets a verified, primary dashboard host at
-- admin.<slug>.<base domain of its own primary storefront host>. Deriving the
-- base from the tenant's own primary host keeps this correct across the staging
-- and .localhost families the seed registers, without reading app config.
--
-- ON CONFLICT DO NOTHING, not a plain INSERT: tenant_domains_hostname_key is
-- global, so a tenant that already registered this exact name as a storefront
-- host must be left for an operator rather than failing the whole deploy.
INSERT INTO "tenant_domains" ("id", "tenant_id", "hostname", "is_primary", "kind", "verified_at", "created_at", "updated_at")
SELECT gen_random_uuid(),
       t."id",
       'admin.' || d."hostname",
       true,
       'dashboard',
       now(),
       now(),
       now()
FROM "tenants" t
JOIN "tenant_domains" d
  ON d."tenant_id" = t."id"
 AND d."is_primary"
 AND d."kind" = 'storefront'
 AND d."verified_at" IS NOT NULL
ON CONFLICT ("hostname") DO NOTHING;
