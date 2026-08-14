CREATE TYPE "notification_area" AS ENUM ('tenant', 'partner', 'affiliate');

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "area" "notification_area" NOT NULL,
  "event_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "target_type" TEXT NOT NULL,
  "target_id" UUID,
  "dedupe_key" TEXT NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Idempotency for an at-least-once outbox. With this index the write is
-- INSERT … ON CONFLICT DO NOTHING and needs no read-before-write, unlike the
-- email channel's deliberately racy `alreadySent` count.
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key"
  ON "notifications"("user_id", "dedupe_key");

-- The feed.
CREATE INDEX "notifications_feed_idx"
  ON "notifications"("user_id", "tenant_id", "area", "created_at" DESC);

-- The unread count. This is the most frequently executed query in the feature
-- (every open dashboard, every 60s) and gets its own partial index.
CREATE INDEX "notifications_unread_idx"
  ON "notifications"("user_id", "tenant_id", "area")
  WHERE "read_at" IS NULL;

-- Retention sweep predicate.
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO app_user, app_admin;
