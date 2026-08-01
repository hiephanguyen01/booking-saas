-- A `sale_price` gains an optional campaign: a window it is valid in, and a name.
--
-- The window bounds the SALE, not the rule. Outside it the rule still applies its
-- regular `price` — a campaign ending must not drop the price to the listing's
-- base, which would be indistinguishable from someone having deleted the rule.
--
-- The window is measured at BOOKING time ("book before 31/12 for this price"),
-- which is what makes it a campaign. Discounting particular STAY dates is
-- already expressible as a `date_range` rule.
--
-- Half-open `[sale_starts_at, sale_ends_at)`, matching the `tstzrange '[)'`
-- convention `bookings.blocked_period` already uses. NULL on either side means
-- unbounded on that side.
--
-- pricing_rules already enforces RLS (tenant_isolation), so adding columns needs
-- no policy change, and `pricing_rules_scope_key` is unchanged: one rule per
-- scope still holds — a campaign is an attribute of that one row.

ALTER TABLE "pricing_rules"
  ADD COLUMN "sale_starts_at" TIMESTAMPTZ(6),
  ADD COLUMN "sale_ends_at"   TIMESTAMPTZ(6),
  ADD COLUMN "campaign_label" TEXT;

-- A window that ends before it starts can never apply; refuse it at the source
-- rather than letting it sit in the table looking like a live campaign.
ALTER TABLE "pricing_rules"
  ADD CONSTRAINT "pricing_rules_sale_window_check"
  CHECK ("sale_starts_at" IS NULL OR "sale_ends_at" IS NULL OR "sale_starts_at" < "sale_ends_at");
