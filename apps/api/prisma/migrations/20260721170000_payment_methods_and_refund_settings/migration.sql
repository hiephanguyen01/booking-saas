ALTER TABLE "tenant_gateway_configs"
  ADD COLUMN "settings" JSONB NOT NULL DEFAULT
    '{"enabledMethods":["bank_transfer"],"refundStrategy":"manual","manualRefundSlaHours":72}'::jsonb;

COMMENT ON COLUMN "tenant_gateway_configs"."settings" IS
  'Non-secret enabled checkout methods and refund policy; validated by @booking/contracts';

CREATE TYPE "refund_execution_mode" AS ENUM ('manual', 'automatic');

ALTER TABLE "refunds"
  ADD COLUMN "execution_mode" "refund_execution_mode" NOT NULL DEFAULT 'manual',
  ADD COLUMN "due_at" TIMESTAMPTZ(6),
  ADD COLUMN "completed_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "refund_amount_positive" CHECK ("amount" > 0);

CREATE UNIQUE INDEX "refunds_tenant_manual_reference_key"
  ON "refunds" ("tenant_id", ("evidence"->>'reference'))
  WHERE "evidence"->>'reference' IS NOT NULL;
