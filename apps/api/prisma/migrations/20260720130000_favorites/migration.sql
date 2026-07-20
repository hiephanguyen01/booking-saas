CREATE TABLE "favorites" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "listing_id" UUID,
  "group_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favorites_pkey" PRIMARY KEY ("id"),
  -- Exactly one target: a listing OR a group, never both, never neither.
  CONSTRAINT "favorites_one_target_check" CHECK (("listing_id" IS NOT NULL) <> ("group_id" IS NOT NULL)),
  CONSTRAINT "favorites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "favorites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "favorites_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "favorites_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "favorites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "listing_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One heart per (customer, target). Partial uniques because the "off" target is NULL.
CREATE UNIQUE INDEX "favorites_customer_listing_key" ON "favorites"("customer_id", "listing_id") WHERE "listing_id" IS NOT NULL;
CREATE UNIQUE INDEX "favorites_customer_group_key" ON "favorites"("customer_id", "group_id") WHERE "group_id" IS NOT NULL;

CREATE INDEX "favorites_tenant_id_created_at_idx" ON "favorites"("tenant_id", "created_at" DESC);
CREATE INDEX "favorites_partner_id_created_at_idx" ON "favorites"("partner_id", "created_at" DESC);
CREATE INDEX "favorites_customer_id_created_at_idx" ON "favorites"("customer_id", "created_at" DESC);
CREATE INDEX "favorites_listing_id_idx" ON "favorites"("listing_id");
CREATE INDEX "favorites_group_id_idx" ON "favorites"("group_id");

ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "favorites" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "favorites"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "favorites" TO app_user, app_admin;

INSERT INTO "permissions" ("key", "scope_level") VALUES
  ('tenant.favorites.read', 'tenant'),
  ('partner.favorites.read', 'partner')
ON CONFLICT ("key") DO UPDATE SET "scope_level" = EXCLUDED."scope_level";

INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r.id, x.permission_key
FROM "roles" r
CROSS JOIN LATERAL (
  SELECT unnest(CASE
    WHEN r.name IN ('Tenant Owner', 'Manager') AND r.scope_level = 'tenant' THEN ARRAY['tenant.favorites.read']
    WHEN r.name = 'Partner Owner' AND r.scope_level = 'partner' THEN ARRAY['partner.favorites.read']
    ELSE ARRAY[]::text[]
  END) AS permission_key
) x
WHERE r.is_system = true
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
