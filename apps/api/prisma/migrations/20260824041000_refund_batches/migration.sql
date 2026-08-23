-- Allocate one business refund across exact source payment captures while keeping
-- existing refunds as provider/manual execution units.

CREATE TYPE "refund_batch_status" AS ENUM (
  'processing',
  'manual_required',
  'completed',
  'failed'
);

CREATE TABLE "refund_batches" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "requested_amount" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "affects_booking_status" BOOLEAN NOT NULL DEFAULT true,
  "status" "refund_batch_status" NOT NULL DEFAULT 'processing',
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "refund_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_batches_requested_amount_check" CHECK ("requested_amount" > 0),
  CONSTRAINT "refund_batches_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "refund_batches_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refund_batches_tenant_id_booking_id_reason_key"
  ON "refund_batches"("tenant_id", "booking_id", "reason");
CREATE INDEX "refund_batches_tenant_id_status_updated_at_idx"
  ON "refund_batches"("tenant_id", "status", "updated_at");

ALTER TABLE "refunds"
  ADD COLUMN "refund_batch_id" UUID;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_refund_batch_id_fkey"
    FOREIGN KEY ("refund_batch_id") REFERENCES "refund_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "refunds_refund_batch_id_idx" ON "refunds"("refund_batch_id");

-- A batch intentionally owns several child refunds with the same booking/reason.
-- Business-level idempotency now lives on refund_batches instead of this legacy
-- single-refund partial unique index.
DROP INDEX IF EXISTS "refunds_booking_reason_key";
CREATE INDEX "refunds_booking_id_reason_idx" ON "refunds"("booking_id", "reason");

-- booking_settlements.refund_id becomes a business-refund reference. Legacy flows
-- store Refund.id; batched flows store RefundBatch.id. A single FK cannot express
-- that polymorphic reference, so retain the UUID + unique constraint but remove
-- the legacy refunds-only FK. Application CAS/idempotency remains authoritative.
ALTER TABLE "booking_settlements"
  DROP CONSTRAINT IF EXISTS "booking_settlements_refund_id_fkey";

ALTER TABLE "refund_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refund_batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "refund_batches"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "refund_batches" TO app_user, app_admin;
