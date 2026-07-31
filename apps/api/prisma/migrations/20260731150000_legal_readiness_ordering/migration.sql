-- `legal.readiness_changed` carries an absolute {legalReady, publishedCount}
-- snapshot computed inside the emitting transaction, and the tenancy handler
-- used to write it unconditionally. Outbox delivery is at-least-once and out of
-- order (a failed row backs off up to 300s while newer rows keep draining), so a
-- retried stale snapshot could re-stamp `legal_ready_at` after a withdrawal had
-- cleared it — reopening the storefront gate on a tenant with no published
-- privacy policy, permanently, since nothing else ever recomputes the column.
--
-- This column records the emit time (DB clock, `outbox_events.created_at`) of
-- the newest readiness event already applied, so the handler's UPDATE can be a
-- guarded compare-and-set instead of last-writer-wins.
ALTER TABLE "tenants"
  ADD COLUMN "legal_readiness_at" TIMESTAMPTZ(6);

-- Tenants whose readiness was stamped by the seed (or by an event delivered
-- before this migration) must not have their first real event rejected: NULL
-- means "nothing applied yet", which the guard treats as always-older.
