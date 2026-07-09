-- Task 1.8 — Inventory mode (§9.4). Adds the security deposit + fulfillment
-- (pickup/return/damage) columns to bookings. `bookings` already has FORCE RLS +
-- a tenant_isolation policy, so adding columns needs no new RLS migration.

ALTER TABLE "bookings"
  ADD COLUMN "security_deposit" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "picked_up_at" TIMESTAMPTZ(6),
  ADD COLUMN "returned_at" TIMESTAMPTZ(6),
  ADD COLUMN "damage_amount" BIGINT NOT NULL DEFAULT 0;
