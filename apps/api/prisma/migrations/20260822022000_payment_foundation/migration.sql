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
