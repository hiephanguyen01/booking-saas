-- A date-specific `custom_hours` exception gains N opening windows, so a special
-- day can break for lunch the same way the weekly schedule already can (a split
-- shift is simply two availability_rules for one weekday).
--
-- `open_time`/`close_time` stay as a mirror of `windows[0]`, written by the
-- repository on every save, so readers predating this column keep working.
-- (resource_id, date) stays unique — this is one row with many windows, not many
-- rows, which keeps the upsert semantics the calendar's range writes depend on.
--
-- availability_exceptions already enforces RLS (tenant_isolation), so adding a
-- column needs no policy change.

ALTER TABLE "availability_exceptions"
  ADD COLUMN "windows" JSONB;

-- Backfill so `windows` is populated everywhere and the read-time fallback to the
-- legacy pair stays a safety net rather than a routine path.
UPDATE "availability_exceptions"
SET "windows" = jsonb_build_array(
      jsonb_build_object('openTime', "open_time", 'closeTime', "close_time"))
WHERE "type" = 'custom_hours'
  AND "open_time" IS NOT NULL
  AND "close_time" IS NOT NULL;
