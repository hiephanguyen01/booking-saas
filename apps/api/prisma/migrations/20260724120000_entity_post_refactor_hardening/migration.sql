-- Entity-centric post-refactor constraint and relay hardening wave.
--
-- Preflight historical data before creating unique backstops. A failed
-- preflight aborts the migration with the conflicting business key instead of
-- letting CREATE UNIQUE INDEX fail with an opaque index-build error.
DO $$
DECLARE
  duplicate_tenant UUID;
BEGIN
  SELECT tenant_id
    INTO duplicate_tenant
  FROM tenant_domains
  WHERE is_primary
  GROUP BY tenant_id
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_tenant IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot enforce one primary domain: tenant % has multiple primary domains',
      duplicate_tenant;
  END IF;
END
$$;

CREATE UNIQUE INDEX "tenant_domains_one_primary_per_tenant_key"
  ON "tenant_domains" ("tenant_id")
  WHERE "is_primary";

ALTER TABLE "notification_logs"
  ADD COLUMN "dedupe_key" TEXT;

UPDATE "notification_logs"
SET "dedupe_key" = NULLIF("payload"->>'dedupeKey', '')
WHERE "payload" ? 'dedupeKey';

DO $$
DECLARE
  duplicate_key TEXT;
BEGIN
  SELECT dedupe_key
    INTO duplicate_key
  FROM notification_logs
  WHERE status = 'sent' AND dedupe_key IS NOT NULL
  GROUP BY dedupe_key
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_key IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot enforce notification sent dedupe: key % occurs more than once',
      duplicate_key;
  END IF;
END
$$;

-- Failed attempts intentionally remain repeatable. Only a successful delivery
-- consumes a dedupe key.
CREATE UNIQUE INDEX "notification_logs_sent_dedupe_key_key"
  ON "notification_logs" ("dedupe_key")
  WHERE "status" = 'sent' AND "dedupe_key" IS NOT NULL;

ALTER TABLE "outbox_events"
  ADD COLUMN "dead_lettered_at" TIMESTAMPTZ(6);

-- Match the relay's live-row predicate so parked/processed history does not
-- bloat the hot polling index.
CREATE INDEX "outbox_events_live_available_at_created_at_idx"
  ON "outbox_events" ("available_at", "created_at")
  WHERE "processed_at" IS NULL AND "dead_lettered_at" IS NULL;
