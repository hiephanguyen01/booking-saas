CREATE TYPE "tenant_invitation_status" AS ENUM ('pending', 'accepted', 'revoked');

CREATE TABLE "tenant_invitations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "email" CITEXT NOT NULL,
  "role_ids" UUID[] NOT NULL,
  "token_hash" TEXT NOT NULL,
  "invited_by_user_id" UUID,
  "status" "tenant_invitation_status" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "accepted_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tenant_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tenant_invitations_accepted_user_id_fkey" FOREIGN KEY ("accepted_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tenant_invitations_token_hash_key" ON "tenant_invitations"("token_hash");
CREATE INDEX "tenant_invitations_tenant_id_status_created_at_idx"
  ON "tenant_invitations"("tenant_id", "status", "created_at" DESC);

-- One live invitation per address per tenant. Revoked/accepted rows stay as history.
CREATE UNIQUE INDEX "tenant_invitations_pending_email_key"
  ON "tenant_invitations"("tenant_id", "email")
  WHERE "status" = 'pending';

ALTER TABLE "tenant_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_invitations"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_invitations" TO app_user, app_admin;
