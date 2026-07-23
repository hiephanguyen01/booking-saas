# PR #6 — Affiliate aggregates + commission lifecycle — Implementation Plan

> **Execution rule:** implement task-by-task. After every task: commit → prepare a review package →
> independent spec/quality review → fix every finding (and re-review when needed) before starting the
> next task. After Task 5, run a separate final review over the whole branch. Do not collapse these
> gates.

**Goal:** Refactor the affiliate write-path around three framework-free aggregates —
`Affiliate`, `ReferralLink`, and `AffiliateCommission` — without changing public contracts,
cross-module seams, read projections, outbox payloads, or the concurrency semantics that currently
make delivery idempotent. Commission amounts must remain an exact replay of finance's ledger split.

**Architecture:** Follow
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
§3–§4 and the affiliate survey in
[`entity-centric-survey.md`](../../refactor/entity-centric-survey.md). The aggregate states each
rule; DB uniqueness, atomic increments, unguarded legacy writes, and the set-based paid transition
remain in repositories. Read-heavy/hot projections stay projections.

**Tech stack:** NestJS 11, Prisma + Postgres RLS, zod contracts, pnpm 10.13.1, Node 22.22.0.

## Global constraints

- **NO tests** (ADR 0005). Verification is typecheck + lint + build + `check:rls` + manual runtime.
- **ADR 0006:** controller → use-case → repository-port → repository; no application service
  classes; one injectable use-case per file with one public `execute()`.
- Schema/migrations and read/HTTP contracts are frozen.
- Domain code is framework-free. Entity state keeps VND/rates as `bigint`; wire conversion remains in
  `affiliate.mapper.ts`.
- Rehydrate is tolerant of legacy `payoutInfo: unknown`; do not validate/mangle existing JSON.
- Do not add a hidden `customRate <= 100` rule. Today a rate is only checked against a percent
  tenant-default rule; `null`, no rule, and fixed-rate rule behavior must stay unchanged.
- No new clock. This module currently has no DB/app clock decisions on its write-path.
- Branch: **`refactor/entity-affiliate`**, created from `refactor/entity-centric`; PR base is
  `refactor/entity-centric`.

### Frozen error table

All code/status/message triples stay byte-identical:

| Code | Status | Message |
|---|---:|---|
| `TENANT_NOT_FOUND` | 404 | `Tenant not found` |
| `TENANT_INACTIVE` | 403 | `Tenant is not accepting affiliate applications` |
| `AFFILIATE_NOT_FOUND` | 500 | `Affiliate could not be read back after creation` |
| `AFFILIATE_NOT_FOUND` | 404 | `Affiliate not found` |
| `LISTING_REQUIRED` | 400 | `listingId is required` |
| `CODE_COLLISION` | 409 | `Could not allocate a unique code` |
| `LINK_NOT_FOUND` | 404 | `Referral link not found` |
| `NOT_LINK_OWNER` | 403 | `Not your referral link` |
| `NOT_AN_AFFILIATE` | 403 | `No affiliate account for this user` |
| `NOT_AN_AFFILIATE` | 403 | `No approved affiliate account for this user` |
| `COMMISSION_RATES_NEGATIVE_TENANT` | 400 | `platform% + affiliate% would exceed the tenant commission` |
| `MISSING_HOST` | 400 | `Host header is required` |

`UNKNOWN_HOST` and `VALIDATION_ERROR` are upstream/boundary errors and stay untouched. Reuse shared
`TenantNotFound`; do not mint another. The defensive 500 `AFFILIATE_NOT_FOUND` remains a Nest
`InternalServerErrorException` (a 500 must not masquerade as a `DomainError`).

### Frozen cross-module and event surfaces

- Booking imports `ResolveAttributionUseCase` from
  `affiliate/application/use-cases/resolve-attribution.use-case` and `applyCustomRate` from
  `affiliate/domain/affiliate-rate`.
- Keep exact signatures:

```ts
ResolveAttributionUseCase.execute(
  tx: PrismaTx,
  req: { code: string; customerId: string; listingPartnerId: string },
): Promise<{
  affiliateId: string;
  referralCode: string;
  customRate: bigint | null;
} | null>

applyCustomRate(
  snapshot: CommissionSnapshot,
  customRate: bigint | null,
): CommissionSnapshot
```

- `ResolveAttributionUseCase` continues inside booking's existing `forTenant` transaction. It must
  not open or nest a transaction, and remains the only AffiliateModule export.
- Producer event types, payload key order, and emit order are frozen:
  - `affiliate.applied` → `{ affiliateId: created.id, userId }`
  - `affiliate.approved|affiliate.suspended` → `{ affiliateId, userId: existing.userId }`
  - `affiliate.payout_updated` → `{ affiliateId }`
- Consumer business behavior stays no-throw/no-op on missing or ineligible state:
  `booking.confirmed`, `booking.completed`, `booking.cancelled`, `booking.rejected`,
  `booking.expired`, `booking.refunded`, `payout.paid`.
- Preserve unchecked booking payload behavior except for the spec-authorized missing-tenant
  normalization in Task 5.

### Persistence/concurrency freeze

- Keep unique backstops `(tenant_id,user_id)`, `(tenant_id,code)`, and
  `affiliate_commissions.booking_id`.
- Application and referral-code collisions keep their current check-then-insert behavior, with the
  DB constraints as the final arbiter. The current race-window `P2002` is **not translated** and
  still propagates: recovering it would change a wire-visible 500 and cannot be continued inside the
  already-aborted Postgres transaction. Record the survey's desired recovery as a follow-up; do not
  smuggle it into this behavior-preserving refactor.
- Do **not** invent status CAS for affiliate or commission. Current status/custom-rate/payout writes,
  commission upsert, reverse, and clawback are load-check followed by an unguarded write. Preserve
  that existing race shape; tightening it is a separate behavior PR.
- Keep click persistence as click insert → atomic `{ increment: 1 }` in the same tenant tx.
- Keep `markConfirmedPaid` as one `updateMany({ where: { affiliateId, status: 'confirmed' } })`.
  Never load/save N aggregates.
- A paid commission's displayed `paidAt` is derived from `updatedAt`. Never write an unchanged
  `paid` row; doing so corrupts the reported settlement instant.
- `computeAffiliateCommission` must continue to invoke finance's `computeCommissionSplit` over the
  frozen snapshot. Do not copy/reimplement the math.

---

## Task 1 — Domain: error catalog + three aggregates

**Files**

- Create `apps/api/src/modules/affiliate/domain/errors/affiliate-errors.ts`
- Create `apps/api/src/modules/affiliate/domain/entities/affiliate.entity.ts`
- Create `apps/api/src/modules/affiliate/domain/entities/referral-link.entity.ts`
- Create `apps/api/src/modules/affiliate/domain/entities/affiliate-commission.entity.ts`

**Affiliate**

- Narrow tolerant state: `id`, `tenantId`, `userId`, `status`, `customRate`,
  `payoutInfo`, `createdAt`.
- `static rehydrate(state)`.
- `static apply({ tenantId, userId, payoutInfo, tenantStatus })` returns `NewAffiliate` with
  `status: 'pending'`; inactive tenant throws the frozen `TENANT_INACTIVE`. The use-case must call
  this before entering the tenant tx/looking up an existing membership, because today an inactive
  tenant rejects even a re-apply.
- `setStatus('approved'|'suspended')` accepts every previous state and same-state requests. It must
  still produce the requested status/event intent so the use-case writes and emits exactly as today.
- `setCustomRate(customRate, rule)` owns the existing tenant-share check using
  `violatesTenantShareFloor`; do not tighten null/no-rule/fixed-rule behavior.
- A static framework-free `replacePayoutInfo(input)` write-intent owns whole-object replacement at
  every state. It deliberately does not require rehydrate: the current path performs no pre-read and
  a new read would change query/error behavior.

**ReferralLink**

- Narrow state: `id`, `tenantId`, `affiliateId`, `code`, `target`, `listingId`,
  `clicksCount`, `createdAt`.
- A static target prevalidation runs before `forTenant`, preserving the current direct-use-case error
  position. `static open` owns target/listing consistency; listing target without id throws
  `LISTING_REQUIRED`; tenant-home always stores `listingId: null`.
- `assertOwnedBy(affiliateId)` throws `NOT_LINK_OWNER`.
- The entity does not validate listing existence/published state (not enforced today), uniqueness,
  approval, click logging, or counters.

**AffiliateCommission**

- Narrow state: `id`, `tenantId`, `affiliateId`, `bookingId`, `amount`, `status`, `createdAt`.
- Rehydrate tolerantly; create pending/confirmed when a row is absent.
- Event-driven methods are boolean/no-throw:
  - pending record allowed only from existing `pending`;
  - confirm allowed from `pending|confirmed`;
  - reverse allowed from `pending|confirmed`;
  - clawback allowed from `confirmed|paid`.
- Redelivery of terminal/ineligible states returns `false` without mutation.
- Amount calculation delegates to `computeAffiliateCommission`; pending uses charges `0n`,
  confirmed uses normalized charges.
- Expose the paid-source rule (`confirmed`) for the repository's set-based transition; do not add an
  instance loop.

**Errors**

- Typed 4xx domain errors only: tenant inactive, affiliate not found (404), tenant-share floor,
  listing required, code collision, link not found, not link owner.
- Keep the two `NOT_AN_AFFILIATE` messages in their existing guard use-cases: they are read-side
  selection policy, not one aggregate error.

**Verify/commit/review gate**

1. `pnpm --filter=@booking/api typecheck`.
2. Commit only Task 1 files.
3. Review package: task requirements, commit/diff range, command output, error-table checklist.
4. Independent reviewer checks framework imports, tolerant rehydrate, known-gap preservation,
   no-throw commission transitions, ledger delegation, and exact error bytes.
5. Fix and re-review all findings before Task 2.

---

## Task 2 — Affiliate port split + repository + write use-cases

**Files**

- Create `domain/ports/affiliate-reader.port.ts`
- Rewrite `domain/ports/affiliate-repository.port.ts`
- Modify `infrastructure/repositories/prisma-affiliate.repository.ts`
- Modify affiliate read use-cases/imports and `application/affiliate.mapper.ts` only to consume the
  moved reader types/token
- Refactor `apply-affiliate`, `set-affiliate-status`, `update-affiliate-rate`, and
  `update-affiliate-payout-info`
- Modify `infrastructure/http/affiliate.module.ts` provider bindings (affiliate binding only)

**Port split**

- Preserve `AFFILIATE_REPOSITORY` token for the write port.
- Move fat joined/list/admin projections to `AFFILIATE_READER`:
  `AffiliateRecord`/`AffiliateWithUser` response shapes, list/filter, joined lookup, list, and
  `adminFindMembershipsByUser`.
- Write port consumes entity types and exposes only create/load state and column-granular writes.
  Do not introduce full-state save; payout/status/rate writers must not clobber unrelated columns.
- One Prisma class implements reader + writer. Bind exactly once:

```ts
PrismaAffiliateRepository,
{ provide: AFFILIATE_REPOSITORY, useExisting: PrismaAffiliateRepository },
{ provide: AFFILIATE_READER, useExisting: PrismaAffiliateRepository },
```

**Use-case behavior**

- Apply: tenant admin read remains outside tenant tx; shared `TenantNotFound`; build/validate the
  entity application intent **before** the tenant lookup tx so inactive re-apply still throws; one
  tenant tx; existing apply remains no-emit; new create → emit → joined re-read → rule. Concurrent
  `(tenant,user)` `P2002` remains unhandled/raw exactly as today.
- Status: load state → entity method → same unconditional column update → same event ternary and
  payload. Preserve any→approved/suspended and same-status write+emit.
- Rate: `BigInt` remains before tx; find/rule stay parallel; entity guard; persist only custom rate;
  same effective-rate response.
- Payout: whole-object replace at any status, no new pre-read/not-found mapping; emit before rule
  read, exactly as today.
- BYPASSRLS admin memberships remain strictly read-only and userId-filtered; never pass a projection
  from that path into a write.

**Verify/commit/review gate**

1. API typecheck + lint for touched files.
2. Commit Task 2.
3. Independent reviewer checks DI singleton binding, RLS/admin boundaries, column-granular writes,
   unchanged raw P2002 race behavior, status known-gap, event payload/order, and read projection
   identity.
4. Fix/re-review before Task 3.

---

## Task 3 — ReferralLink port split + hot projection attribution

**Files**

- Create `domain/ports/referral-link-reader.port.ts`
- Create `domain/ports/affiliate-attribution-reader.port.ts`
- Rewrite `domain/ports/referral-link-repository.port.ts`
- Modify `infrastructure/repositories/prisma-referral-link.repository.ts`
- Create `infrastructure/repositories/prisma-affiliate-attribution.reader.ts`
- Refactor `create-referral-link`, `delete-referral-link`, `track-referral`, and
  `resolve-attribution`
- Move read-use-case/mapper imports to the reader port
- Modify module bindings for link reader/writer + attribution reader

**Rules**

- Preserve `REFERRAL_LINK_REPOSITORY`; add reader/attribution tokens.
- One referral repository class implements reader + writer and uses the same `useExisting` singleton
  pattern.
- Run target prevalidation before `forTenant`. Create retains five attempts; each attempt generates
  once, checks by code, then creates/returns on a miss. A create-time `P2002` still propagates
  exactly as today (the transaction is aborted and cannot safely continue). Five pre-check
  collisions exhaust to the exact `CODE_COLLISION`.
- Delete loads a narrow state, throws exact not-found, then entity ownership check, then delete.
- Track remains host resolution outside tx and a narrow approved-link projection inside one tenant
  tx. Unknown/suspended → `{valid:false}`. Approved → click insert then atomic increment →
  `{valid:true}`. Do not load a full affiliate/link aggregate or add queries to this hot route.
- `ResolveAttributionUseCase` keeps its file, exported type/signature, no-throw-null behavior, logger
  message, parallel fact reads, and caller-owned `tx`. Move raw Prisma reads behind the new narrow
  port; do not open `forTenant`.
- Keep `applyCustomRate` path/signature untouched.

**Verify/commit/review gate**

1. API typecheck + lint for touched files.
2. Commit Task 3.
3. Independent reviewer checks the booking import/signature, transaction ownership, hot-query count
   and selects, fraud ordering/no-throw behavior, five-attempt collision semantics, click write
   order, and reader/writer DI aliases.
4. Fix/re-review before Task 4.

---

## Task 4 — AffiliateCommission port split + event-driven use-cases

**Files**

- Create `domain/ports/affiliate-commission-reader.port.ts`
- Rewrite `domain/ports/affiliate-commission-repository.port.ts`
- Modify `infrastructure/repositories/prisma-affiliate-commission.repository.ts`
- Refactor `record-pending-commission`, `record-confirmed-commission`,
  `reverse-commission`, `clawback-commission`
- Keep `mark-commissions-paid` set-based; only adapt its port type if needed
- Modify `application/booking-finance-view.ts` and
  `domain/affiliate-commission-amount.ts` only to move pure amount-normalization rules to domain
- Move commission read use-cases/mapper imports to the reader port
- Modify module bindings for commission reader/writer

**Rules**

- Preserve `AFFILIATE_COMMISSION_REPOSITORY`; split reporting/list/totals projections behind
  `AFFILIATE_COMMISSION_READER`; one Prisma instance via `useExisting`.
- Keep `AffiliateCommissionWithBooking`, filters, totals, booking status union, joins, pagination,
  totals bookkeeping, and `paidAt = updatedAt` byte/shape-identical.
- Each handler use-case still opens exactly one tenant tx.
- Missing booking/affiliate attribution remains no-op. Missing commission is path-specific:
  pending/confirmed create it via booking-id upsert; reverse/clawback no-op.
- Use aggregate boolean transitions, then call the same persistence primitive:
  booking-id upsert for pending/confirmed; unguarded booking-id update for reverse/clawback.
- Do not add new status predicates to those writes. Preserve current race shape.
- `markConfirmedPaid` remains one guarded `updateMany`; no instance rehydrate and no writes to rows
  outside `confirmed`.
- `loadBookingFinanceView` stays a narrow RLS projection. Snapshot fallback remains
  `defaultCommissionSnapshot(partner?.isHouse ?? false)`.
- Preserve exact rules: fundedBy only when `discountAmount > 0n`; additional charge accepts safe
  integer number/digit string/bigint, ignores other values, sums, then clamps non-positive total to
  `0n`.
- Commission amount must still call finance's `computeCommissionSplit` exactly once through
  `computeAffiliateCommission`; no duplicated formula.

**Verify/commit/review gate**

1. API typecheck + lint for touched files.
2. Commit Task 4.
3. Independent reviewer checks all five statuses/transitions, no-throw redelivery, correct
   path-specific missing-row behavior, ledger parity, amount normalization, unchanged upsert/update
   concurrency, set-based paid, and paidAt integrity.
4. Fix/re-review before Task 5.

---

## Task 5 — Outbox wiring hygiene + docs

**Files**

- Modify `apps/api/src/modules/affiliate/infrastructure/http/affiliate.module.ts`
- Modify `apps/api/CLAUDE.md`

**Outbox wiring**

- Add a module logger and a private `requireTenantId(eventType, tenantId): string | null`, matching
  the established notification/promotions wording:
  `skipping ${eventType}: outbox event has no tenantId`.
- For each booking event: validate tenant; absent → logged `Promise.resolve()` skip; present → call
  the same use-case with unchanged `bookingIdOf`.
- For `payout.paid`, preserve the payload filter first. Non-affiliate or missing payeeId remains a
  silent no-op. For an affiliate payee, validate tenant and skip+log if absent.
- Do not add bookingId/payee payload validation or swallow infra errors. The only normalized behavior
  is missing tenantId, authorized by spec §4.
- Update handler comments to state business no-op vs infra retry behavior.

**Docs**

- Add `affiliate` to the `apps/api/CLAUDE.md` list of entity-style modules.
- Do not update HANDOFF status until the PR is actually merged.

**Verify/commit/review gate**

1. API typecheck + lint.
2. Commit Task 5.
3. Independent reviewer checks all seven registrations, missing-tenant skip/no-throw, unchanged
   payload filters, provider/export wiring, and docs accuracy.
4. Fix/re-review before final review.

---

## Final review, verification, and PR handoff

1. Independent final reviewer examines the full
   `refactor/entity-centric..refactor/entity-affiliate` diff against this plan, the design spec, and
   the affiliate survey. Carry all minor findings explicitly; fix/re-review every blocking finding.
2. Confirm no schema/migration/contract/controller response changes and no test files/scripts.
3. With Node 22.22.0:

```bash
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
pnpm turbo lint typecheck build
```

4. Runtime smoke (do not touch other projects' containers/processes; use API `PORT=3001` if needed):
   - apply new + re-apply existing; pending payout update;
   - tenant approve/suspend/same-status and custom-rate set/clear/rejection;
   - referral create tenant-home/listing, delete own/not-own, track valid/invalid/suspended;
   - booking confirmed → pending commission; completed → confirmed with charges;
     cancelled/rejected/expired → reversed; refunded → clawed_back; affiliate payout → paid;
   - redeliver representative events and confirm no business throw/no resurrection;
   - verify commission amount against the finance ledger affiliate leg;
   - verify missing-tenant event is logged/skipped without retry.
5. PR description must list converted write use-cases, frozen surfaces, before/after handler
   throw/no-op audit, P2002 collision behavior, verification evidence, and anything runtime could not
   be verified.
6. PR targets `refactor/entity-centric`. Do not claim PR creation if GitHub tooling is unavailable.
