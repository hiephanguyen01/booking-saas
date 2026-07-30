-- Edits to an already-reviewed listing/post no longer touch the live row: they are
-- parked here until a tenant reviewer approves them (§7.3). The live listing keeps
-- serving customers meanwhile, so the storefront needs no knowledge of review state.

CREATE TYPE "revision_target" AS ENUM ('listing', 'listing_group');
CREATE TYPE "revision_status" AS ENUM ('pending', 'approved', 'rejected', 'discarded');

CREATE TABLE "listing_revisions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "target_type" "revision_target" NOT NULL,
  "target_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "revision_status" NOT NULL DEFAULT 'pending',
  "submitted_by_user_id" UUID,
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "review_note" TEXT,
  "applied_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "listing_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_revisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "listing_revisions_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "listing_revisions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "listing_revisions_tenant_id_status_submitted_at_idx"
  ON "listing_revisions"("tenant_id", "status", "submitted_at" DESC);
CREATE INDEX "listing_revisions_tenant_id_target_submitted_at_idx"
  ON "listing_revisions"("tenant_id", "target_type", "target_id", "submitted_at" DESC);

-- One waiting edit per target: saving again overwrites it, so "what is pending"
-- is never ambiguous for the partner or the reviewer.
CREATE UNIQUE INDEX "listing_revisions_pending_target_key"
  ON "listing_revisions"("tenant_id", "target_type", "target_id")
  WHERE "status" = 'pending';

ALTER TABLE "listing_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_revisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "listing_revisions"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "listing_revisions" TO app_user, app_admin;
