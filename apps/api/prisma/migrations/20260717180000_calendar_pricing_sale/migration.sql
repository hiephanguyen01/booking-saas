ALTER TYPE pricing_rule_type ADD VALUE IF NOT EXISTS 'date_time_range';

ALTER TABLE pricing_rules
  ADD COLUMN sale_price bigint;

ALTER TABLE pricing_rules
  ADD CONSTRAINT pricing_rules_sale_price_check
  CHECK (sale_price IS NULL OR (sale_price > 0 AND sale_price < price));

-- Older code allowed multiple exceptions for the same resource/day even though
-- the availability resolver can consume only one. Keep the newest row before
-- enforcing the one-effective-exception invariant.
DELETE FROM availability_exceptions older
USING availability_exceptions newer
WHERE older.resource_id = newer.resource_id
  AND older.date = newer.date
  AND (older.created_at, older.id) < (newer.created_at, newer.id);

CREATE UNIQUE INDEX availability_exceptions_resource_id_date_key
  ON availability_exceptions(resource_id, date);
