ALTER TYPE "payment_gateway" ADD VALUE IF NOT EXISTS 'sepay' BEFORE 'payos';

ALTER TABLE "payments"
  ADD COLUMN "gateway_order_ref" TEXT,
  ADD COLUMN "gateway_order_id" TEXT,
  ADD COLUMN "payment_method" TEXT;

CREATE UNIQUE INDEX "payments_gateway_gateway_order_ref_key"
  ON "payments"("gateway", "gateway_order_ref");
