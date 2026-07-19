ALTER TABLE "listing_groups"
  ADD COLUMN "review_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "listings"
  ADD COLUMN "rating_avg" DECIMAL(3,2),
  ADD COLUMN "review_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "reviews" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "listing_id" UUID NOT NULL,
  "group_id" UUID,
  "partner_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reviews_booking_id_key" UNIQUE ("booking_id"),
  CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reviews_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "listing_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "reviews_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "review_replies" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "review_id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_replies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_replies_review_id_key" UNIQUE ("review_id"),
  CONSTRAINT "review_replies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_replies_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_replies_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "review_replies_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "reviews_tenant_id_created_at_idx" ON "reviews"("tenant_id", "created_at" DESC);
CREATE INDEX "reviews_partner_id_created_at_idx" ON "reviews"("partner_id", "created_at" DESC);
CREATE INDEX "reviews_customer_id_created_at_idx" ON "reviews"("customer_id", "created_at" DESC);
CREATE INDEX "reviews_listing_id_created_at_idx" ON "reviews"("listing_id", "created_at" DESC);
CREATE INDEX "reviews_group_id_created_at_idx" ON "reviews"("group_id", "created_at" DESC);
CREATE INDEX "reviews_tenant_id_rating_created_at_idx" ON "reviews"("tenant_id", "rating", "created_at" DESC);
CREATE INDEX "review_replies_tenant_id_created_at_idx" ON "review_replies"("tenant_id", "created_at" DESC);
CREATE INDEX "review_replies_partner_id_created_at_idx" ON "review_replies"("partner_id", "created_at" DESC);

ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reviews"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE "review_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "review_replies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "review_replies"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "reviews", "review_replies" TO app_user, app_admin;

INSERT INTO "permissions" ("key", "scope_level") VALUES
  ('platform.reviews.read', 'platform'),
  ('platform.disputes.read', 'platform'),
  ('tenant.reviews.read', 'tenant'),
  ('tenant.disputes.read', 'tenant'),
  ('tenant.disputes.resolve', 'tenant'),
  ('partner.reviews.read', 'partner'),
  ('partner.reviews.reply', 'partner'),
  ('partner.disputes.read', 'partner'),
  ('partner.disputes.respond', 'partner')
ON CONFLICT ("key") DO UPDATE SET "scope_level" = EXCLUDED."scope_level";

INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r.id, x.permission_key
FROM "roles" r
CROSS JOIN LATERAL (
  SELECT unnest(CASE
    WHEN r.name = 'Super Admin' AND r.scope_level = 'platform' THEN ARRAY['platform.reviews.read', 'platform.disputes.read']
    WHEN r.name = 'Support' AND r.scope_level = 'platform' THEN ARRAY['platform.reviews.read', 'platform.disputes.read']
    WHEN r.name IN ('Tenant Owner', 'Manager') AND r.scope_level = 'tenant' THEN ARRAY['tenant.reviews.read', 'tenant.disputes.read', 'tenant.disputes.resolve']
    WHEN r.name = 'Finance' AND r.scope_level = 'tenant' THEN ARRAY['tenant.disputes.read', 'tenant.disputes.resolve']
    WHEN r.name = 'Partner Owner' AND r.scope_level = 'partner' THEN ARRAY['partner.reviews.read', 'partner.reviews.reply', 'partner.disputes.read', 'partner.disputes.respond']
    WHEN r.name = 'Staff' AND r.scope_level = 'partner' THEN ARRAY['partner.disputes.read', 'partner.disputes.respond']
    ELSE ARRAY[]::text[]
  END) AS permission_key
) x
WHERE r.is_system = true
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
