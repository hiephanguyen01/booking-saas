# Entity-centric post-refactor hardening plan

> Date: 2026-07-24
> Base: `refactor/entity-centric` at `f3b18e3`
> Scope: the actionable follow-ups recorded in HANDOFF §7 and design spec
> §8b/§8b-bis/§8c/§8c-bis after all 16 module refactors.

## Global constraints

- No tests. Verification is lint + typecheck + build + `check:rls` + migrations and runtime smoke.
- Preserve controller contracts, DTOs, error codes/messages/statuses, outbox payloads, and event order
  unless this plan explicitly introduces a new internal infrastructure field/event.
- Keep `controller → use-case → repository port → repository`; no application services.
- Tenant writes stay in one `TenantDbService.forTenant` transaction.
- Modules do not import another module's application/domain/infrastructure implementation.
- Hand-write every migration. Do not touch the RLS, ledger, or booking GiST no-touch zones.
- Database time owns relay scheduling/dead-letter timestamps.

## Registry reconciliation before edits

- Already satisfied in existing migrations; do not duplicate:
  - `refunds (booking_id, reason)` partial unique
  - tenant-scoped manual-refund evidence reference partial unique
  - one dispute per settlement (`settlement_id` unique)
- Still actionable:
  - real notification `dedupe_key` + sent-row unique backstop
  - one-primary-domain partial unique
  - outbox max-attempt dead-letter parking
  - draft listing/group fixtures
  - Turbo root config hashing
  - promotions → partner implementation import
  - listing moderation shim
  - booking fulfillment write without CAS
  - stale dead-code/type-only cleanup
  - HTTP re-verification of seeded tenant/partner permissions
- Explicit product/wire decisions remain decision-gated, not guessed:
  `SetPlatformRate` route vs deletion, response-key removals, state-graph tightening, new gateway
  support, and other design-spec §8a behavior changes.

## Task 1 — Infrastructure and migration wave

1. Add nullable `notification_logs.dedupe_key`, backfill from
   `payload->>'dedupeKey'`, and add a partial unique index for non-null `sent` rows.
2. Write/read the real column in `PrismaNotificationLogRepository`; keep payload compatibility.
3. Add the one-primary-domain partial unique index after a migration preflight that fails with a
   useful message if historical duplicates exist.
4. Add nullable `outbox_events.dead_lettered_at`. Relay claims only live rows, retries with the
   existing backoff, and parks a row at 20 failed attempts using the DB clock.
5. Preserve dead letters in platform-health failure counts for operator visibility.
6. Deploy migration, regenerate Prisma, run `check:rls`, and exercise a permanently failing row.

## Task 2 — Tooling, fixtures, and safe cleanup

1. Make Turbo hash root ESLint/TypeScript/shared config inputs.
2. Add stable, idempotent StudioHub draft listing + draft group fixtures without disturbing the 120
   published catalog items or cleanup rules.
3. Replace the content-report reader's contract-property indirection with `ContentReportReason`.
4. Remove confirmed-zero-consumer catalog mapper/contracts exports and rebuild every consumer.
5. Reseed and prove tenant owner / partner owner permission rows and HTTP authorization.

## Task 3 — Module boundary and moderation consolidation

1. Replace promotions' imports of partner's agreement port/repository with a promotions-owned
   `IPromoAgreementRecorder` port and local Prisma adapter. Keep proof creation atomic in the same
   opt-in transaction and keep the persisted row byte-for-byte equivalent.
2. Promote moderation failures to typed `DomainError`s.
3. Move listing/listing-group moderation transitions behind aggregate methods while retaining the
   shared pure transition implementation where that avoids duplication.
4. Remove `runModeration`; keep audit writes, timestamps, group cascade, actor selection, messages,
   status codes, and event payload/order unchanged.
5. Run module lint/typecheck/build and runtime moderation smoke.

## Task 4 — Guard booking fulfillment writes

1. Change `patchFulfillment` to a CAS operation guarded by expected booking status and fulfillment
   marker (`picked_up_at IS NULL` / `returned_at IS NULL`).
2. Raise the existing `BOOKING_STATE_CHANGED` 409 on a lost race.
3. Keep return's status transition guarded by the aggregate's originally observed `confirmed`
   status; do not re-read a newer status and treat it as the expected source.
4. Verify pickup/return success, replay rejection, concurrent stale-write rejection, emitted event
   order, and transaction rollback on CAS miss.

## Task 5 — Final branch review and handoff

1. Review `main...refactor/entity-centric` for architecture, schema/RLS, cross-module imports,
   unguarded fulfillment writes, moderation shim residue, and stale debt documentation.
2. Run forced full `pnpm turbo lint typecheck build`, `check:rls`, migration status, seed, and
   targeted runtime smoke.
3. Update HANDOFF/spec registry with implemented evidence and the exact remaining owner decisions.
4. Commit each coherent wave and leave `refactor/entity-centric` clean.
