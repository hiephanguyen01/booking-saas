-- Payment foundation: durable checkout metadata + immutable gateway config revisions.

-- CreateEnum
CREATE TYPE "payment_checkout_state" AS ENUM ('creating', 'ready', 'create_failed');

-- AlterTable
ALTER TABLE "payments"
  ADD COLUMN "captured_amount" BIGINT,
  ADD COLUMN "checkout_state" "payment_checkout_state",
  ADD COLUMN "gateway_config_revision_id" UUID;

-- The old uniqueness forced credential rotation to overwrite the same row.
DROP INDEX "tenant_gateway_configs_tenant_id_gateway_environment_key";

-- Historical revisions may share tenant/gateway/environment; keep the lookup indexed.
CREATE INDEX "tenant_gateway_configs_tenant_id_gateway_environment_idx"
  ON "tenant_gateway_configs"("tenant_id", "gateway", "environment");

-- The old schema allowed one active sandbox row and one active production row for
-- the same gateway at the database level. The application already treated that as
-- invalid, but normalize any historical drift deterministically before tightening
-- the DB invariant so deploy cannot fail on legacy data. Keep the newest revision.
WITH ranked_active AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, gateway
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS active_rank
  FROM tenant_gateway_configs
  WHERE is_active = true
)
UPDATE tenant_gateway_configs AS config
SET is_active = false,
    updated_at = now()
FROM ranked_active
WHERE config.id = ranked_active.id
  AND ranked_active.active_rank > 1;

-- One active revision per exact gateway. Base-gateway group exclusivity remains
-- enforced transactionally by PrismaGatewayConfigRepository under a tenant lock.
CREATE UNIQUE INDEX "tenant_gateway_configs_one_active_revision_per_gateway"
  ON "tenant_gateway_configs"("tenant_id", "gateway")
  WHERE "is_active" = true;

CREATE INDEX "payments_gateway_config_revision_id_idx"
  ON "payments"("gateway_config_revision_id");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_gateway_config_revision_id_fkey"
  FOREIGN KEY ("gateway_config_revision_id")
  REFERENCES "tenant_gateway_configs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
