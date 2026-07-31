-- One pricing rule per scope, enforced by the database.
--
-- "Saving the same scope replaces it" was only ever an application-level
-- agreement, and the check backing it compared `params` with JSON.stringify —
-- key-order sensitive, while Postgres normalises jsonb key order on write. The
-- comparison therefore never matched a stored date-scoped rule, the replace
-- silently did nothing, and re-saving a scope inserted a second row. Two
-- concurrent saves could do the same even with the comparison fixed.
--
-- Three steps, in this order: the unique index cannot be created while
-- duplicates exist.

-- 1. Collapse duplicates, keeping the most recent row of each scope — that is
--    the partner's latest intent (the older row is the edit they thought they
--    had overwritten).
DELETE FROM "pricing_rules" p
USING "pricing_rules" q
WHERE p."listing_id" = q."listing_id"
  AND p."booking_mode" = q."booking_mode"
  AND p."rule_type" = q."rule_type"
  AND p."params" = q."params"
  AND (p."created_at" < q."created_at"
       OR (p."created_at" = q."created_at" AND p."id" < q."id"));

-- 2. Re-band `priority` onto the single scale (`PRICING_RULE_PRIORITY`). Rows
--    predate it and carry three generations of values; `date_range` at 1000 in
--    particular TIED with `date_time_range`, and a tie resolves by array order
--    rather than by anything the partner chose.
UPDATE "pricing_rules" SET "priority" = 100
  WHERE "rule_type" IN ('day_of_week', 'time_range') AND "priority" <> 100;
UPDATE "pricing_rules" SET "priority" = 500
  WHERE "rule_type" = 'date_range' AND "priority" <> 500;
UPDATE "pricing_rules" SET "priority" = 1000
  WHERE "rule_type" = 'date_time_range' AND "priority" <> 1000;

-- 3. The invariant itself. `params` is jsonb with a btree operator class, and
--    Postgres has already normalised its key order, so this index key IS the
--    semantic scope. Prisma cannot express a Json column in `@@unique`, so this
--    index lives only here — see the note on the model in schema.prisma.
CREATE UNIQUE INDEX "pricing_rules_scope_key"
  ON "pricing_rules" ("listing_id", "booking_mode", "rule_type", "params");
