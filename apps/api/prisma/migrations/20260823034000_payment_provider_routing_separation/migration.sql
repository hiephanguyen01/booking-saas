-- Separate provider credentials, checkout routing and tenant refund policy.
-- This migration is additive: historical gateway settings/revisions remain intact.

ALTER TABLE "payments"
  ADD COLUMN "refund_strategy_snapshot" TEXT,
  ADD COLUMN "manual_refund_sla_hours_snapshot" INTEGER;

CREATE TABLE "tenant_payment_method_routes" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "method" TEXT NOT NULL,
  "gateway" "payment_gateway" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_payment_method_routes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_payment_method_routes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_payment_method_routes_method_check"
    CHECK ("method" IN ('bank_transfer','napas_qr','international_card','momo_wallet','zalopay_wallet')),
  CONSTRAINT "tenant_payment_method_routes_gateway_check"
    CHECK ("gateway"::text IN ('sepay','payos','momo','zalopay','mock'))
);

CREATE UNIQUE INDEX "tenant_payment_method_routes_tenant_id_method_key"
  ON "tenant_payment_method_routes"("tenant_id", "method");
CREATE INDEX "tenant_payment_method_routes_tenant_id_gateway_idx"
  ON "tenant_payment_method_routes"("tenant_id", "gateway");

CREATE TABLE "tenant_refund_policies" (
  "tenant_id" UUID NOT NULL,
  "refund_strategy" TEXT NOT NULL,
  "manual_refund_sla_hours" INTEGER NOT NULL,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_refund_policies_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "tenant_refund_policies_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_refund_policies_strategy_check"
    CHECK ("refund_strategy" IN ('manual','automatic_preferred')),
  CONSTRAINT "tenant_refund_policies_sla_check"
    CHECK ("manual_refund_sla_hours" BETWEEN 1 AND 720)
);

ALTER TABLE "tenant_payment_method_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_payment_method_routes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_payment_method_routes"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_payment_method_routes" TO app_user, app_admin;

ALTER TABLE "tenant_refund_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_refund_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_refund_policies"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_refund_policies" TO app_user, app_admin;

-- Wallet routes preserve the old exact-wallet preference. A base/mock provider that
-- happened to advertise a wallet method never becomes a wallet route during backfill.
INSERT INTO "tenant_payment_method_routes" (
  "id", "tenant_id", "method", "gateway", "enabled", "created_at", "updated_at"
)
SELECT gen_random_uuid(), c."tenant_id", 'momo_wallet', 'momo'::"payment_gateway", true,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenant_gateway_configs" c
WHERE c."is_active" = true
  AND c."gateway" = 'momo'::"payment_gateway"
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(c."settings"::jsonb -> 'enabledMethods', '[]'::jsonb)) m(value)
    WHERE m.value = 'momo_wallet'
  )
ON CONFLICT ("tenant_id", "method") DO NOTHING;

INSERT INTO "tenant_payment_method_routes" (
  "id", "tenant_id", "method", "gateway", "enabled", "created_at", "updated_at"
)
SELECT gen_random_uuid(), c."tenant_id", 'zalopay_wallet', 'zalopay'::"payment_gateway", true,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenant_gateway_configs" c
WHERE c."is_active" = true
  AND c."gateway" = 'zalopay'::"payment_gateway"
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(c."settings"::jsonb -> 'enabledMethods', '[]'::jsonb)) m(value)
    WHERE m.value = 'zalopay_wallet'
  )
ON CONFLICT ("tenant_id", "method") DO NOTHING;

-- Non-wallet routes mirror legacy findActiveBase()/pickConfigForMethod(): choose the
-- single active non-wallet config (old invariant), then keep only capability-valid methods.
WITH tenants_with_base AS (
  SELECT DISTINCT c."tenant_id"
  FROM "tenant_gateway_configs" c
  WHERE c."is_active" = true
    AND c."gateway" NOT IN ('momo'::"payment_gateway", 'zalopay'::"payment_gateway")
), chosen_base AS (
  SELECT t."tenant_id", chosen."gateway", chosen."settings"
  FROM tenants_with_base t
  JOIN LATERAL (
    SELECT c."gateway", c."settings"
    FROM "tenant_gateway_configs" c
    WHERE c."tenant_id" = t."tenant_id"
      AND c."is_active" = true
      AND c."gateway" NOT IN ('momo'::"payment_gateway", 'zalopay'::"payment_gateway")
    ORDER BY c."created_at" ASC, c."id" ASC
    LIMIT 1
  ) chosen ON true
), methods(method) AS (
  VALUES ('bank_transfer'::text), ('napas_qr'::text), ('international_card'::text)
)
INSERT INTO "tenant_payment_method_routes" (
  "id", "tenant_id", "method", "gateway", "enabled", "created_at", "updated_at"
)
SELECT gen_random_uuid(), b."tenant_id", m.method, b."gateway", true,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM chosen_base b
CROSS JOIN methods m
WHERE b."gateway"::text IN ('sepay','payos','mock')
  AND (
    (b."gateway"::text = 'sepay' AND m.method IN ('bank_transfer','napas_qr','international_card')) OR
    (b."gateway"::text = 'payos' AND m.method = 'bank_transfer') OR
    (b."gateway"::text = 'mock')
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(b."settings"::jsonb -> 'enabledMethods', '[]'::jsonb)) em(value)
    WHERE em.value = m.method
  )
ON CONFLICT ("tenant_id", "method") DO NOTHING;

-- Current tenant refund policy is initialized deterministically. Historical Payments
-- keep NULL snapshots and continue to use their exact gateway revision settings.
WITH policy_source AS (
  SELECT t."id" AS "tenant_id", source."settings"
  FROM "tenants" t
  LEFT JOIN LATERAL (
    SELECT c."settings", priority
    FROM (
      SELECT c."settings", c."created_at", c."id", 1 AS priority
      FROM "tenant_gateway_configs" c
      WHERE c."tenant_id" = t."id" AND c."is_active" = true
        AND c."gateway" NOT IN ('momo'::"payment_gateway", 'zalopay'::"payment_gateway")
      UNION ALL
      SELECT c."settings", c."created_at", c."id", 2 AS priority
      FROM "tenant_gateway_configs" c
      WHERE c."tenant_id" = t."id" AND c."is_active" = true
        AND c."gateway" = 'momo'::"payment_gateway"
      UNION ALL
      SELECT c."settings", c."created_at", c."id", 3 AS priority
      FROM "tenant_gateway_configs" c
      WHERE c."tenant_id" = t."id" AND c."is_active" = true
        AND c."gateway" = 'zalopay'::"payment_gateway"
    ) c
    ORDER BY priority ASC, c."created_at" ASC, c."id" ASC
    LIMIT 1
  ) source ON true
)
INSERT INTO "tenant_refund_policies" (
  "tenant_id", "refund_strategy", "manual_refund_sla_hours", "updated_by", "created_at", "updated_at"
)
SELECT p."tenant_id",
  CASE
    WHEN p."settings"::jsonb ->> 'refundStrategy' IN ('manual','automatic_preferred')
      THEN p."settings"::jsonb ->> 'refundStrategy'
    ELSE 'manual'
  END,
  CASE
    WHEN COALESCE(p."settings"::jsonb ->> 'manualRefundSlaHours', '') ~ '^[0-9]+$'
      AND (p."settings"::jsonb ->> 'manualRefundSlaHours')::integer BETWEEN 1 AND 720
      THEN (p."settings"::jsonb ->> 'manualRefundSlaHours')::integer
    ELSE 72
  END,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM policy_source p
ON CONFLICT ("tenant_id") DO NOTHING;
