-- Harden the tenant-custody lifecycle without rewriting the already-applied
-- booking_settlements migration. This migration separates refund/dispute/payout
-- facts, makes payout maturity explicit, and repairs the old backfill ordering.

CREATE TYPE "settlement_kind" AS ENUM (
  'service_completed',
  'customer_no_show',
  'cancellation_fee'
);

CREATE TYPE "settlement_dispute_status" AS ENUM ('open', 'accepted', 'rejected', 'resolved');
CREATE TYPE "settlement_dispute_resolution" AS ENUM ('release', 'full_refund', 'partial_refund');
CREATE TYPE "payout_allocation_status" AS ENUM ('reserved', 'paid', 'released');

ALTER TABLE "booking_settlements"
  ADD COLUMN "kind" "settlement_kind" NOT NULL DEFAULT 'service_completed',
  ADD COLUMN "refunded_amount" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "retained_amount" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "refund_id" UUID;

ALTER TABLE "booking_settlements"
  ADD CONSTRAINT "booking_settlements_refund_id_key" UNIQUE ("refund_id"),
  ADD CONSTRAINT "booking_settlements_refund_id_fkey"
    FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "booking_settlements_refund_amounts_check"
    CHECK (refunded_amount >= 0 AND retained_amount >= 0
           AND refunded_amount + retained_amount <= online_held_amount);

ALTER TABLE "ledger_entries"
  ADD COLUMN "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "ledger_entries" SET "available_at" = "created_at";
CREATE INDEX "ledger_entries_account_id_available_at_idx"
  ON "ledger_entries"("account_id", "available_at");

ALTER TABLE "bookings"
  ADD COLUMN "refund_due_amount" BIGINT,
  ADD COLUMN "refund_percent" INTEGER,
  ADD CONSTRAINT "bookings_refund_due_amount_check"
    CHECK (refund_due_amount IS NULL OR refund_due_amount >= 0),
  ADD CONSTRAINT "bookings_refund_percent_check"
    CHECK (refund_percent IS NULL OR refund_percent BETWEEN 0 AND 100);

-- Persist whether a confirmed refund terminates the booking. Partial dispute
-- refunds and security-deposit returns intentionally leave its service status.
ALTER TABLE "refunds"
  ADD COLUMN "affects_booking_status" BOOLEAN NOT NULL DEFAULT true;
UPDATE "refunds"
SET "affects_booking_status" = false
WHERE "reason" = 'security_deposit';

UPDATE "bookings" b
SET refund_due_amount = (
  SELECT r.amount
  FROM refunds r
  WHERE r.booking_id = b.id AND r.reason = 'booking_cancellation'
  ORDER BY r.created_at DESC
  LIMIT 1
)
WHERE b.status IN ('cancelled', 'refunded')
  AND EXISTS (
    SELECT 1 FROM refunds r
    WHERE r.booking_id = b.id AND r.reason = 'booking_cancellation'
  );

CREATE TABLE "settlement_disputes" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "settlement_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "opened_by_user_id" UUID NOT NULL,
  "opened_by_role" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "partner_response" TEXT,
  "partner_responded_by" UUID,
  "partner_responded_at" TIMESTAMPTZ(6),
  "status" "settlement_dispute_status" NOT NULL DEFAULT 'open',
  "resolution" "settlement_dispute_resolution",
  "resolution_note" TEXT,
  "refund_amount" BIGINT NOT NULL DEFAULT 0,
  "resolved_by" UUID,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "settlement_disputes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlement_disputes_refund_amount_check" CHECK (refund_amount >= 0),
  CONSTRAINT "settlement_disputes_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "settlement_disputes_settlement_id_fkey" FOREIGN KEY ("settlement_id")
    REFERENCES "booking_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "settlement_disputes_booking_id_fkey" FOREIGN KEY ("booking_id")
    REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "settlement_disputes_tenant_id_status_created_at_idx"
  ON "settlement_disputes"("tenant_id", "status", "created_at");
CREATE INDEX "settlement_disputes_booking_id_idx" ON "settlement_disputes"("booking_id");
CREATE UNIQUE INDEX "settlement_disputes_settlement_id_key"
  ON "settlement_disputes"("settlement_id");

CREATE TABLE "payout_allocations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "payout_id" UUID NOT NULL,
  "settlement_id" UUID NOT NULL,
  "amount" BIGINT NOT NULL,
  "status" "payout_allocation_status" NOT NULL DEFAULT 'reserved',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payout_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payout_allocations_payout_id_settlement_id_key" UNIQUE ("payout_id", "settlement_id"),
  CONSTRAINT "payout_allocations_amount_check" CHECK (amount > 0),
  CONSTRAINT "payout_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payout_allocations_payout_id_fkey" FOREIGN KEY ("payout_id")
    REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payout_allocations_settlement_id_fkey" FOREIGN KEY ("settlement_id")
    REFERENCES "booking_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "payout_allocations_tenant_id_idx" ON "payout_allocations"("tenant_id");
CREATE INDEX "payout_allocations_settlement_id_status_idx"
  ON "payout_allocations"("settlement_id", "status");
CREATE INDEX "payouts_open_payee_idx"
  ON "payouts"("tenant_id", "payee_type", "payee_id")
  WHERE "status" IN ('pending', 'processing');
CREATE UNIQUE INDEX "refunds_booking_reason_key"
  ON "refunds"("booking_id", "reason") WHERE "reason" IS NOT NULL;

ALTER TABLE "settlement_disputes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settlement_disputes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "settlement_disputes"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE "payout_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payout_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payout_allocations"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "settlement_disputes" TO app_user, app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON "payout_allocations" TO app_user, app_admin;

-- Correct the previous migration's fixed three-day deadline with the tenant's
-- normalized payout.holdingDays setting. Invalid/missing settings fall back to 3.
WITH tenant_policy AS (
  SELECT id,
    CASE
      WHEN settings->'payout'->>'holdingDays' ~ '^\d+$'
        THEN LEAST(GREATEST((settings->'payout'->>'holdingDays')::int, 0), 90)
      ELSE 3
    END AS holding_days
  FROM tenants
)
UPDATE booking_settlements bs
SET dispute_until = bs.completed_at + (tp.holding_days * interval '1 day'),
    updated_at = now()
FROM tenant_policy tp
WHERE tp.id = bs.tenant_id
  AND bs.status = 'dispute_window'
  AND bs.completed_at IS NOT NULL;

-- Classify legacy terminal branches and put refunds ahead of old revenue facts.
UPDATE booking_settlements bs
SET kind = CASE
      WHEN b.status = 'no_show' THEN 'customer_no_show'::settlement_kind
      WHEN b.status = 'cancelled' OR EXISTS (
        SELECT 1 FROM refunds r
        WHERE r.booking_id = b.id AND r.reason = 'booking_cancellation'
      ) THEN 'cancellation_fee'::settlement_kind
      ELSE 'service_completed'::settlement_kind
    END,
    updated_at = now()
FROM bookings b
WHERE b.id = bs.booking_id;

WITH latest_refund AS (
  SELECT DISTINCT ON (booking_id)
    id, booking_id, amount, status, reason, created_at
  FROM refunds
  WHERE reason IS DISTINCT FROM 'security_deposit'
  ORDER BY booking_id, created_at DESC
), tenant_policy AS (
  SELECT id,
    CASE
      WHEN settings->'payout'->>'holdingDays' ~ '^\d+$'
        THEN LEAST(GREATEST((settings->'payout'->>'holdingDays')::int, 0), 90)
      ELSE 3
    END AS holding_days
  FROM tenants
)
UPDATE booking_settlements bs
SET refund_id = r.id,
    kind = CASE
      WHEN r.reason = 'booking_cancellation' THEN 'cancellation_fee'::settlement_kind
      ELSE bs.kind
    END,
    refunded_amount = LEAST(
      CASE WHEN r.reason = 'booking_cancellation'
        THEN GREATEST(r.amount - bs.security_deposit_held, 0)
        ELSE r.amount
      END,
      bs.online_held_amount
    ),
    retained_amount = GREATEST(
      bs.online_held_amount - CASE WHEN r.reason = 'booking_cancellation'
        THEN GREATEST(r.amount - bs.security_deposit_held, 0)
        ELSE r.amount
      END,
      0
    ),
    status = CASE
      WHEN r.status = 'succeeded' AND
        (CASE WHEN r.reason = 'booking_cancellation'
          THEN GREATEST(r.amount - bs.security_deposit_held, 0)
          ELSE r.amount
        END) >= bs.online_held_amount AND NOT EXISTS (
        SELECT 1 FROM ledger_entries le
        WHERE le.booking_id = bs.booking_id
          AND le.entry_type IN ('booking_revenue', 'partner_share', 'platform_fee', 'cancellation_fee')
      ) THEN 'refunded'::settlement_status
      WHEN r.status = 'succeeded' AND
        (CASE WHEN r.reason = 'booking_cancellation'
          THEN GREATEST(r.amount - bs.security_deposit_held, 0)
          ELSE r.amount
        END) < bs.online_held_amount AND NOT EXISTS (
        SELECT 1 FROM ledger_entries le
        WHERE le.booking_id = bs.booking_id
          AND le.entry_type IN ('booking_revenue', 'partner_share', 'platform_fee', 'cancellation_fee')
      ) THEN 'dispute_window'::settlement_status
      ELSE 'refund_pending'::settlement_status
    END,
    completed_at = CASE
      WHEN r.status = 'succeeded' AND
        (CASE WHEN r.reason = 'booking_cancellation'
          THEN GREATEST(r.amount - bs.security_deposit_held, 0)
          ELSE r.amount
        END) < bs.online_held_amount
        THEN COALESCE(bs.completed_at, r.created_at)
      ELSE bs.completed_at
    END,
    dispute_until = CASE
      WHEN r.status = 'succeeded' AND
        (CASE WHEN r.reason = 'booking_cancellation'
          THEN GREATEST(r.amount - bs.security_deposit_held, 0)
          ELSE r.amount
        END) < bs.online_held_amount
        THEN COALESCE(bs.completed_at, r.created_at) + (tp.holding_days * interval '1 day')
      WHEN r.status = 'succeeded' AND
        (CASE WHEN r.reason = 'booking_cancellation'
          THEN GREATEST(r.amount - bs.security_deposit_held, 0)
          ELSE r.amount
        END) >= bs.online_held_amount THEN NULL
      ELSE bs.dispute_until
    END,
    updated_at = now()
FROM latest_refund r, tenant_policy tp
WHERE r.booking_id = bs.booking_id
  AND tp.id = bs.tenant_id;

-- A cancelled paid booking without a refund row must stay blocked from release
-- until Payments creates/confirms the refund; it is not already refunded.
UPDATE booking_settlements bs
SET status = 'refund_pending'::settlement_status,
    retained_amount = 0,
    updated_at = now()
FROM bookings b
WHERE b.id = bs.booking_id
  AND b.status = 'cancelled'
  AND bs.refund_id IS NULL
  AND bs.online_held_amount > 0
  AND (b.refund_due_amount IS NULL OR b.refund_due_amount > 0);

-- A durable zero refund is different from an unknown legacy refund intent: the
-- service deposit is a cancellation fee and must wait through the dispute buffer,
-- not remain refund_pending forever waiting for a refund row that will never exist.
WITH tenant_policy AS (
  SELECT id,
    CASE
      WHEN settings->'payout'->>'holdingDays' ~ '^\d+$'
        THEN LEAST(GREATEST((settings->'payout'->>'holdingDays')::int, 0), 90)
      ELSE 3
    END AS holding_days
  FROM tenants
)
UPDATE booking_settlements bs
SET status = 'dispute_window'::settlement_status,
    kind = 'cancellation_fee'::settlement_kind,
    refunded_amount = 0,
    retained_amount = bs.online_held_amount,
    completed_at = COALESCE(bs.completed_at, b.updated_at),
    dispute_until = COALESCE(bs.completed_at, b.updated_at)
      + (tp.holding_days * interval '1 day'),
    updated_at = now()
FROM bookings b, tenant_policy tp
WHERE b.id = bs.booking_id
  AND tp.id = bs.tenant_id
  AND b.status = 'cancelled'
  AND b.refund_due_amount = 0
  AND bs.refund_id IS NULL
  AND bs.online_held_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM ledger_entries le
    WHERE le.booking_id = bs.booking_id
      AND le.entry_type IN ('booking_revenue', 'partner_share', 'platform_fee', 'cancellation_fee')
  );

-- Repair no-show rows that have no terminal journal: hold them through the same
-- tenant-configured dispute window instead of making them immediately payable.
WITH tenant_policy AS (
  SELECT id,
    CASE
      WHEN settings->'payout'->>'holdingDays' ~ '^\d+$'
        THEN LEAST(GREATEST((settings->'payout'->>'holdingDays')::int, 0), 90)
      ELSE 3
    END AS holding_days
  FROM tenants
)
UPDATE booking_settlements bs
SET status = 'dispute_window'::settlement_status,
    kind = 'customer_no_show'::settlement_kind,
    onsite_collected_amount = 0,
    completed_at = COALESCE(bs.completed_at, b.updated_at),
    dispute_until = COALESCE(bs.completed_at, b.updated_at) + (tp.holding_days * interval '1 day'),
    updated_at = now()
FROM bookings b, tenant_policy tp
WHERE b.id = bs.booking_id
  AND tp.id = bs.tenant_id
  AND b.status = 'no_show'
  AND bs.status NOT IN ('refund_pending', 'refunded')
  AND NOT EXISTS (
    SELECT 1 FROM ledger_entries le
    WHERE le.booking_id = bs.booking_id
      AND le.entry_type IN ('booking_revenue', 'partner_share', 'platform_fee', 'cancellation_fee')
  );

-- Preserve traceability for legacy released settlements where the original
-- migration knew a journal existed but did not store its id.
UPDATE booking_settlements bs
SET release_journal_id = x.journal_id,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (booking_id) booking_id, journal_id
  FROM ledger_entries
  WHERE booking_id IS NOT NULL
    AND entry_type IN ('booking_revenue', 'partner_share', 'platform_fee', 'cancellation_fee')
  ORDER BY booking_id, created_at, journal_id
) x
WHERE x.booking_id = bs.booking_id
  AND bs.release_journal_id IS NULL;

-- Backfill booking-level traceability for historical Partner payouts. Treat
-- released settlement payables and payout runs as FIFO ranges; every overlap is
-- one allocation. Affiliate payouts are intentionally excluded because they do
-- not map to a booking settlement's Partner payable.
WITH settlement_ranges AS (
  SELECT bs.id AS settlement_id, bs.tenant_id, bs.partner_id,
         COALESCE(SUM(bs.partner_payable) OVER (
           PARTITION BY bs.tenant_id, bs.partner_id
           ORDER BY bs.released_at, bs.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0)::bigint AS range_start,
         SUM(bs.partner_payable) OVER (
           PARTITION BY bs.tenant_id, bs.partner_id
           ORDER BY bs.released_at, bs.id
         )::bigint AS range_end
  FROM booking_settlements bs
  WHERE bs.release_journal_id IS NOT NULL
    AND bs.partner_payable > 0
), payout_ranges AS (
  SELECT p.id AS payout_id, p.tenant_id, p.payee_id AS partner_id, p.status,
         COALESCE(SUM(p.amount) OVER (
           PARTITION BY p.tenant_id, p.payee_id
           ORDER BY p.created_at, p.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0)::bigint AS range_start,
         SUM(p.amount) OVER (
           PARTITION BY p.tenant_id, p.payee_id
           ORDER BY p.created_at, p.id
         )::bigint AS range_end
  FROM payouts p
  WHERE p.payee_type = 'partner'::payout_payee_type
    AND p.status IN ('pending'::payout_status, 'processing'::payout_status, 'paid'::payout_status)
), allocation_overlaps AS (
  SELECT pr.tenant_id, pr.payout_id, sr.settlement_id, pr.status,
         LEAST(pr.range_end, sr.range_end) - GREATEST(pr.range_start, sr.range_start) AS amount
  FROM payout_ranges pr
  JOIN settlement_ranges sr
    ON sr.tenant_id = pr.tenant_id
   AND sr.partner_id = pr.partner_id
   AND pr.range_start < sr.range_end
   AND sr.range_start < pr.range_end
)
INSERT INTO payout_allocations (
  id, tenant_id, payout_id, settlement_id, amount, status, created_at, updated_at
)
SELECT gen_random_uuid(), tenant_id, payout_id, settlement_id, amount,
       CASE WHEN status = 'paid'::payout_status
         THEN 'paid'::payout_allocation_status
         ELSE 'reserved'::payout_allocation_status
       END,
       now(), now()
FROM allocation_overlaps
WHERE amount > 0
ON CONFLICT (payout_id, settlement_id) DO NOTHING;
