-- Tenant-custodied booking funds: provider success creates a hold, completion
-- opens a dispute window, and only release creates earnings/payables.
CREATE TYPE "settlement_status" AS ENUM (
  'held',
  'dispute_window',
  'disputed',
  'released',
  'refunded'
);

CREATE TABLE "booking_settlements" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "status" "settlement_status" NOT NULL DEFAULT 'held',
  "online_held_amount" BIGINT NOT NULL,
  "onsite_collected_amount" BIGINT NOT NULL DEFAULT 0,
  "security_deposit_held" BIGINT NOT NULL DEFAULT 0,
  "tenant_commission_gross" BIGINT NOT NULL DEFAULT 0,
  "tenant_net_earning" BIGINT NOT NULL DEFAULT 0,
  "partner_gross_earning" BIGINT NOT NULL DEFAULT 0,
  "partner_payable" BIGINT NOT NULL DEFAULT 0,
  "platform_fee" BIGINT NOT NULL DEFAULT 0,
  "affiliate_commission" BIGINT NOT NULL DEFAULT 0,
  "completed_at" TIMESTAMPTZ(6),
  "dispute_until" TIMESTAMPTZ(6),
  "released_at" TIMESTAMPTZ(6),
  "release_journal_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_settlements_booking_id_key" UNIQUE ("booking_id"),
  CONSTRAINT "booking_settlements_payment_id_key" UNIQUE ("payment_id"),
  CONSTRAINT "booking_settlements_non_negative_check" CHECK (
    online_held_amount >= 0 AND onsite_collected_amount >= 0 AND
    security_deposit_held >= 0 AND tenant_commission_gross >= 0 AND
    partner_gross_earning >= 0 AND partner_payable >= 0 AND
    platform_fee >= 0 AND affiliate_commission >= 0
  ),
  CONSTRAINT "booking_settlements_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "booking_settlements_booking_id_fkey" FOREIGN KEY ("booking_id")
    REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "booking_settlements_payment_id_fkey" FOREIGN KEY ("payment_id")
    REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "booking_settlements_partner_id_fkey" FOREIGN KEY ("partner_id")
    REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "booking_settlements_tenant_id_idx" ON "booking_settlements"("tenant_id");
CREATE INDEX "booking_settlements_partner_id_status_idx"
  ON "booking_settlements"("partner_id", "status");
CREATE INDEX "booking_settlements_status_dispute_until_idx"
  ON "booking_settlements"("status", "dispute_until");

ALTER TABLE "booking_settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_settlements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "booking_settlements"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "booking_settlements" TO app_user, app_admin;

-- Backfill one settlement per booking from the first successful provider payment.
-- Existing revenue journals remain authoritative and are never recreated.
WITH paid AS (
  SELECT DISTINCT ON (p.booking_id)
    p.id AS payment_id,
    p.tenant_id,
    p.booking_id,
    p.amount,
    p.paid_at,
    b.partner_id,
    b.status AS booking_status,
    b.security_deposit,
    b.updated_at AS booking_updated_at,
    EXISTS (
      SELECT 1 FROM ledger_entries le
      WHERE le.booking_id = b.id
        AND le.entry_type IN ('booking_revenue', 'partner_share', 'platform_fee')
    ) AS has_revenue_journal
  FROM payments p
  JOIN bookings b ON b.id = p.booking_id
  WHERE p.status = 'succeeded'
  ORDER BY p.booking_id, p.paid_at NULLS LAST, p.created_at
)
INSERT INTO booking_settlements (
  id, tenant_id, booking_id, payment_id, partner_id, status,
  online_held_amount, security_deposit_held, completed_at, dispute_until, released_at
)
SELECT
  gen_random_uuid(),
  tenant_id,
  booking_id,
  payment_id,
  partner_id,
  CASE
    WHEN has_revenue_journal THEN 'released'::settlement_status
    WHEN booking_status = 'completed' THEN 'dispute_window'::settlement_status
    WHEN booking_status IN ('cancelled', 'refunded') THEN 'refunded'::settlement_status
    ELSE 'held'::settlement_status
  END,
  GREATEST(amount - security_deposit, 0),
  LEAST(security_deposit, amount),
  CASE WHEN booking_status = 'completed' THEN booking_updated_at ELSE NULL END,
  CASE WHEN booking_status = 'completed' AND NOT has_revenue_journal
    THEN booking_updated_at + interval '3 days' ELSE NULL END,
  CASE WHEN has_revenue_journal THEN booking_updated_at ELSE NULL END
FROM paid
ON CONFLICT (booking_id) DO NOTHING;

-- Populate released settlement read-model amounts from existing ledger facts.
UPDATE booking_settlements bs
SET
  partner_gross_earning = x.partner_gross,
  partner_payable = GREATEST(x.partner_net, 0),
  onsite_collected_amount = GREATEST(x.partner_gross - x.partner_net, 0),
  platform_fee = x.platform_fee,
  affiliate_commission = x.affiliate_commission,
  tenant_net_earning = x.tenant_net,
  tenant_commission_gross = GREATEST(x.tenant_net + x.platform_fee + x.affiliate_commission, 0)
FROM (
  SELECT
    le.booking_id,
    COALESCE(SUM(le.credit) FILTER (WHERE la.owner_type = 'partner' AND le.entry_type = 'partner_share'), 0)::bigint AS partner_gross,
    COALESCE(SUM(le.credit - le.debit) FILTER (WHERE la.owner_type = 'partner'), 0)::bigint AS partner_net,
    COALESCE(SUM(le.credit) FILTER (WHERE la.owner_type = 'platform' AND le.entry_type = 'platform_fee'), 0)::bigint AS platform_fee,
    COALESCE(SUM(le.credit) FILTER (WHERE la.owner_type = 'affiliate' AND le.entry_type = 'affiliate_commission'), 0)::bigint AS affiliate_commission,
    COALESCE(SUM(le.credit - le.debit) FILTER (
      WHERE la.owner_type = 'tenant' AND la.owner_id = le.tenant_id
    ), 0)::bigint AS tenant_net
  FROM ledger_entries le
  JOIN ledger_accounts la ON la.id = le.account_id
  GROUP BY le.booking_id
) x
WHERE bs.booking_id = x.booking_id
  AND bs.status = 'released';
