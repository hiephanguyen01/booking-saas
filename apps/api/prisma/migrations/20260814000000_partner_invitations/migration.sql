ALTER TABLE "tenant_invitations"
  ADD COLUMN "partner_id" UUID,
  ADD CONSTRAINT "tenant_invitations_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "tenant_invitations_partner_id_status_idx"
  ON "tenant_invitations"("partner_id", "status");

-- One live invitation per address per scope. partner_id must be part of the key so a
-- person can hold a pending tenant invitation AND a pending invitation to a partner in
-- that tenant. NULLS NOT DISTINCT is load-bearing: without it two tenant-scope rows
-- (partner_id IS NULL) to the same address would stop colliding, silently removing the
-- duplicate-invite guard the tenant tier relies on.
DROP INDEX "tenant_invitations_pending_email_key";
CREATE UNIQUE INDEX "tenant_invitations_pending_email_key"
  ON "tenant_invitations"("tenant_id", "partner_id", "email")
  NULLS NOT DISTINCT
  WHERE "status" = 'pending';
