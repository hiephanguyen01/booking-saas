# PR #8 — Partner aggregate + status/verification lifecycles — Implementation Plan

> **Execution rule:** implement task-by-task. After every task: commit → prepare a review package →
> independent spec/quality review → fix every finding (and re-review when needed) before starting the
> next task. After Task 5, run a separate final review over the whole branch. Do not collapse these
> gates.

**Goal:** Refactor the partner write-path around one framework-free `Partner` aggregate while
preserving both independent lifecycles (partner status and identity verification), append-only
agreement proof, public/read projections, cross-module Listing/Promotions seams, transaction
boundaries, and every current race/known gap.

**Architecture:** Follow
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
§3–§4 and the partner survey in
[`entity-centric-survey.md`](../../refactor/entity-centric-survey.md). `Partner` owns policy and
produces narrow column-write intents. Cross-row uniqueness, the future-booking fact, cancellation
policy visibility, the identity-review row lock, membership/role writes, and JSON persistence remain
repository concerns. `AgreementAcceptance` remains an append-only record, not an aggregate.

**Tech stack:** NestJS 11, Prisma + PostgreSQL RLS, raw PostgreSQL row/range SQL, zod contracts,
opaque-session RBAC, pnpm 10.13.1, Node 22.22.0.

## Global constraints

- **NO tests** (ADR 0005). Verification is typecheck + lint + build + `check:rls` + manual runtime.
- **ADR 0006:** controller → use-case → repository-port → repository; no application service
  classes; one injectable use-case per file with one public `execute()`.
- Schema/migrations, controllers, DTOs/contracts, routes/decorators/guards, response shapes, public
  profile filtering, and the read side are frozen.
- Domain code is framework-free. Rehydrate accepts legacy/empty JSONB and nullable historical data.
- Entity methods do not call `new Date()`/`Date.now()`. Identity review receives the current
  app-clock sample; `verifiedAt` keeps its later app-clock sample. The suspend query keeps PostgreSQL
  `now()` and must not move into memory.
- Writes remain column-granular. Never save a full aggregate snapshot: payout, documents, identity,
  status, and cancellation-policy writes currently touch disjoint columns and must not clobber one
  another.
- Exactly one `forTenant` transaction per tenant business operation. Partner-scoped routes continue
  to resolve `tenantId` first on the admin/BYPASSRLS pool, then write/read through one tenant tx.
- Outbox events remain in the same tenant transaction and preserve type, payload key order, and
  relative write/emit ordering.
- Branch: **`refactor/entity-partner`**, created from `refactor/entity-centric` after this plan
  commit; PR base is `refactor/entity-centric`.

### Frozen surfaced error table

All status/code/message triples reachable from Partner routes and the existing Nest/global-filter
envelope stay byte-identical:

| Code | Status | Message |
|---|---:|---|
| `TENANT_NOT_FOUND` | 404 | `Tenant not found` |
| `TENANT_INACTIVE` | 403 | `Tenant is not accepting partner applications` |
| `INVALID_ADMINISTRATIVE_DIVISION` | 400 | `The selected ward does not belong to the selected province` |
| `NO_ACTIVE_PLAN` | 403 | `Tenant has no active subscription plan` |
| `PLAN_LIMIT_REACHED` | 403 | ``Plan limit reached for maxPartners (max ${limit})`` |
| `PARTNER_SLUG_TAKEN` | 409 | ``Slug "${slug}" is already in use`` |
| `PARTNER_NOT_FOUND` | 404 | `Partner not found` |
| `INVALID_PARTNER_STATE` | 409 | ``Cannot approve a partner in "${status}" state`` |
| `PARTNER_HAS_ACTIVE_BOOKINGS` | 409 | `Cannot suspend a partner with active bookings` |
| `NO_PENDING_IDENTITY` | 409 | `There is no pending identity submission to review` |
| `MISSING_DOB` | 400 | `Identity submission is missing a date of birth` |
| `UNDER_18` | 403 | `Partner is under 18 — cannot verify for people-booking listing types` |
| `NAME_MISMATCH` | 403 | `ID holder name does not match the payout account holder name` |
| `CANCELLATION_POLICY_NOT_FOUND` | 404 | `Cancellation policy not found` |
| `PARTNER_NOT_VERIFIED` | 403 | `Partner must complete identity verification to serve this listing type` |
| `PUBLIC_PARTNER_NOT_FOUND` | 404 | `Public partner profile not found` |
| `MISSING_HOST` | 400 | `Host header is required to resolve a tenant` |
| `UNKNOWN_HOST` | 404 | ``No tenant mapped to host "${hostname}"`` |
| `SUBSCRIPTION_EXPIRED` | 403 | `Subscription has expired — the dashboard is read-only` |
| `VALIDATION_ERROR` | 400 | `Invalid request payload` |
| `NOT_AUTHENTICATED` | 401 | `Authentication required` |
| `SESSION_EXPIRED` | 401 | `Session is invalid or expired` |
| `NO_PERMISSION_DECLARED` | 403 | `Route declares no permissions and is denied by default` |
| `MISSING_PERMISSION` | 403 | ``Missing permission: ${missing.join(', ')}`` |

Use shared-kernel `TenantNotFound`; do not mint another. Read-only
`PUBLIC_PARTNER_NOT_FOUND`/`MISSING_HOST` remain in their current Nest boundary code. The missing
Partner Owner seed keeps its existing plain `Error('Partner Owner system role is not seeded')`.
`VALIDATION_ERROR` keeps flattened zod `details`. The context-invariant 500 messages remain
`No tenant in context for a tenant-scoped operation` and
`No partner in context for a partner-scoped operation` without a custom code. The app-global
throttle remains 100 requests/60 seconds with the framework 429 envelope. All upstream
auth/tenancy/plan-limit/administrative-division code stays untouched.

### Frozen ports, exports, and cross-module seams

- Preserve symbol identity of `PARTNER_REPOSITORY`, `AGREEMENT_REPOSITORY`, `PARTNER_ROLES`, and
  `PUBLIC_PARTNER_REPOSITORY`.
- `PartnerModule` continues to export exactly `[PARTNER_REPOSITORY]`.
- The module has 13 use-cases: nine write and four read. Do not drop a provider while splitting
  ports.
- Listing directly imports/injects
  `partner/domain/ports/partner-repository.port` and calls
  `IPartnerRepository.findById(tx, partnerId)`. Keep that method name/signature and expose at least
  `id`, `isHouse`, and `verificationStatus` on its returned record.
- Listing directly imports
  `partner/application/assert-can-serve-listing-type`. Keep this path and signature exact:

```ts
assertCanServeListingType(
  partner: { verificationStatus: PartnerVerificationStatus },
  listingType: { requiresIdentityVerification: boolean },
): void
```

- Promotions directly imports the `AGREEMENT_REPOSITORY` token, `IAgreementRepository`, and the
  concrete `PrismaAgreementRepository`. Preserve the exact port/class paths and signature:

```ts
record(tx: PrismaTx, data: {
  tenantId: string;
  partnerId: string;
  userId?: string | null;
  agreementType: 'partner_terms' | 'commission_schedule' | 'promo_funding';
  version: string;
  ip?: string | null;
}): Promise<void>
```

  This known ADR 0003 violation is follow-up debt; do not repair it inside PR #8.
- Keep `PARTNER_ROLES.partnerOwnerRoleId()` and
  `invalidateUserPermissions(userId)` exact. Permission invalidation remains after the application
  transaction commits.
- Keep the full `PartnerRecord` response projection byte/shape-compatible, including earliest-member
  `owner`, every JSONB blob, dates, and timestamps. `IPublicPartnerRepository` and public
  anti-disintermediation/contact scrubbing remain no-touch.

### Frozen transactions, persistence, events, and races

- Apply ordering remains: admin tenant lookup/status gate → address resolution → plan-limit check →
  Partner Owner role lookup → one tenant tx containing slug pre-check → partner insert → member
  insert → role-assignment insert → `partner.applied` emit → joined re-read → commit → permission
  cache invalidation.
- House creation remains one tenant tx: slug pre-check → approved house insert → `partner.created`.
  Its plan-limit enforcement remains the existing controller guards.
- Slug checks remain check-then-insert. The unique index is the final backstop, and concurrent
  `P2002` remains unhandled/raw (current 500). Do not translate it in this refactor.
- Every current unguarded Prisma update-by-id may still surface raw `P2025` if its target disappears
  after an admin lookup or unlocked pre-read. Do not add error translation, a new pre-read, lock, or
  CAS where the current path has none.
- Approval remains approved-short-circuit; only pending may transition. A real approval writes
  status → `partner_terms` acceptance → `commission_schedule` acceptance → `partner.approved`.
  Agreement version defaulting remains `2026-01`; approved replays add no agreements/events.
- Suspension keeps the exact SQL fact:

```sql
status = 'confirmed'
AND upper(COALESCE(timeslot, blocked_period)) > now()
```

  Keep `Number(count)` at the repository edge. There is deliberately no status guard: any state,
  including already suspended, rewrites `suspended` and re-emits `partner.suspended`.
- Identity submission remains an unconditional write to `pending`, including from `verified`;
  it does not clear the stale `verifiedAt`. Changing payout holder after verification still does
  not reset/recheck verification. These are registered known gaps, not fixes.
- Identity review keeps `SELECT id FROM partners WHERE id = $id::uuid FOR UPDATE` followed by the
  Prisma read in the same tx. Decision order is pending → DOB → under-18 → name mismatch.
- Rejection writes `verificationStatus='rejected'` plus merged review metadata and emits
  `partner.verification_rejected` **before the tx commits**; only after commit may the HTTP 403 be
  thrown. Never throw the rejection error from inside `forTenant`.
- Documents merge only supplied `logoUrl`/`licenseDocs` onto current `businessInfo`; payout replaces
  only the whole `payoutInfo` column without a pre-read; identity writes only its own columns.
- Default cancellation policy keeps the same tenant tx query: policy id must be either
  `partnerId: null` or the current partner; `null` clears without a policy lookup. No outbox event.
- Keep current concurrency gaps: approval has no lock/CAS and concurrent approvals may duplicate
  agreements/events; suspension can race a new confirmed booking; plan/status checks can race
  creation; document read/merge/write can lose a concurrent same-blob update; cancellation-policy
  ownership can change between check and update; permission invalidation's Redis `KEYS` then `DEL`
  is not atomic.
- DOB input is regex-shaped rather than calendar-validated. Do not add calendar validation or
  normalize the current JavaScript Date behavior.
- Producer events and payload key order are frozen:
  - `partner.applied` → `{ partnerId: created.id, userId }`
  - `partner.created` → `{ partnerId: created.id, isHouse: true }`
  - `partner.approved` → `{ partnerId }`
  - `partner.suspended` → `{ partnerId }`
  - `partner.identity_submitted` → `{ partnerId }`
  - `partner.verification_rejected` → `{ partnerId, reason }`
  - `partner.verified` → `{ partnerId }`
  - `partner.payout_updated` → `{ partnerId }`
  - `partner.documents_updated` → `{ partnerId }`
- `PartnerModule` consumes no outbox events. However, `partner.approved` has a live Notification
  consumer: missing tenant logs/skips, missing context/no plan is a successful no-op, recipient
  delivery uses deterministic dedupe, and delivery failure rethrows for relay retry. Do not alter
  its registration, payload expectations, or retry behavior. The other `partner.*` events currently
  have no handlers and are marked processed as successful no-ops.

---

## Task 1 — Domain: Partner state, transitions, intents, and typed errors

**Files**

- Create `apps/api/src/modules/partner/domain/errors/partner-errors.ts`
- Create `apps/api/src/modules/partner/domain/entities/partner.entity.ts`
- Keep `domain/agreement-versions.ts` and `domain/partner-verification.ts` in place until all callers
  migrate

**Partner**

- Narrow tolerant `PartnerState`: persisted write-owned fields only — id/tenant identity, name,
  slug, description, partner type/house flag, both statuses, verification timestamps/DOB, four
  JSONB blobs, and default cancellation policy id. Do not put joined `owner` or public stats into
  aggregate state.
- `static rehydrate(state)` copies without validation or normalization.
- `static assertTenantAcceptingApplications(status)` owns the existing active-tenant gate and is
  called immediately after the admin tenant lookup, before address/plan/role work.
  `static apply(...)` then owns pending/non-house creation defaults after the resolved address and
  slug check are available. `static createHouse(...)` forces `company`, `isHouse: true`,
  `status: 'approved'`.
- `approve(agreementVersion?)` returns an explicit no-op for approved; rejects every non-pending
  state; otherwise returns one status intent and exactly two append-only agreement intents
  (`agreementType` + `version`) with current-version defaults in partner-terms then
  commission-schedule order. The use-case adds tenant/partner/actor/IP context.
- `suspend(futureConfirmedBookingCount)` throws only when the fact is positive. It must return a
  write/event intent for every current state and same-state request.
- Static/narrow submission intent accepts the use-case's already-parsed DOB and owns the
  unconditional pending state plus complete identity document object without adding a pre-read.
  The use-case must keep the exact current
  ``new Date(`${input.dateOfBirth}T00:00:00.000Z`)`` construction; do not add calendar validation.
- Identity review receives `reviewedBy`, optional note, and app `now`. It returns no-throw outcomes
  for not-pending/missing-DOB/rejected/eligible so the use-case can preserve commit-then-throw.
  Under-18 wins over name mismatch. Rejection merges identityInfo and defaults review note to the
  reason. A separate verified intent receives the later app-clock `verifiedAt` and defaults review
  note to null.
- Static payout replacement owns exact `{ bank, accountNumber, holderName }` with no state gate.
  Documents merge only defined input keys over tolerant current `businessInfo`.
- Default-policy intent accepts an externally supplied visibility fact, permits null without a
  lookup, and throws the frozen error when non-null is unusable.
- Listing verification policy may move into `Partner` or a narrow static domain function, but the
  old `partner-verification.ts` and application wrapper paths/signatures remain thin compatible
  wrappers until the listing module is refactored.

**Errors**

- Typed 4xx `DomainError` classes for partner-owned table entries except the read-only public/host
  errors. Keep dynamic slug/state messages exact.
- Use shared `TenantNotFound`. Do not represent the role-seed plain 500 or raw Prisma `P2002` as a
  domain error.

**Verify/commit/review gate**

1. `pnpm --filter=@booking/api typecheck`.
2. Commit only Task 1 domain files.
3. Review package: task requirements, commit/diff range, command output, exact error/event checklist.
4. Independent reviewer checks framework-free imports, tolerant rehydrate, both lifecycles,
   approval no-op/agreement order, suspension same-state behavior, identity decision ordering,
   clock injection, stale-verifiedAt/public-status divergence, known gaps, and exact error bytes.
5. Fix and re-review every finding before Task 2.

---

## Task 2 — Partner read/write port split + Prisma singleton

**Files**

- Create `domain/ports/partner-reader.port.ts`
- Rewrite `domain/ports/partner-repository.port.ts`
- Modify `infrastructure/repositories/prisma-partner.repository.ts`
- Move `partner.mapper.ts`, `list-partners`, `get-partner`, and `get-partner-profile` imports to the
  reader port
- Modify `infrastructure/http/partner.module.ts` provider bindings (partner binding only)

**Port split**

- Preserve `PARTNER_REPOSITORY` for the write/cross-module seam; add `PARTNER_READER` for fat
  response/list/admin projections.
- Move `PartnerOwnerRecord`, full `PartnerRecord`, `ListPartnersFilter`, list, and admin
  `tenantIdOfPartner` to the reader port. Re-export the moved record/filter types from
  `partner-repository.port.ts` so the old import path remains source-compatible. The writer may
  import `PartnerRecord` as the existing update/create result shape.
- Keep a temporary `IPartnerRepository.tenantIdOfPartner` compatibility member through Task 4
  because four untouched profile writers still call it. The one Prisma implementation serves both
  aliases, so this does not add an admin query. Move those writers to `PARTNER_READER` and remove the
  compatibility member in Task 5.
- Keep `IPartnerRepository.findById(tx, id): Promise<PartnerRecord | null>` for Listing. Other
  write loads expose `PartnerState` and the locked load keeps the exact raw row-lock protocol.
- Add narrow column persistence methods/intents for status, identity submission/review, payout,
  business info, and default policy. Do not add full-state save or status CAS.
- Keep member/role inserts and future-booking SQL in the write port because they must share the
  caller's tenant tx. Keep slug lookup tenant-scoped.
- During Tasks 2–4, the generic `update` may remain as an explicitly temporary compatibility method
  so every task commit typechecks. The old `PartnerRecord` re-export and temporary
  `tenantIdOfPartner` member likewise keep untouched writers compiling. Remove only the generic
  update and compatibility member in Task 5 after all writers migrate; retain the type re-export as
  the frozen import bridge.
- One Prisma class implements reader + writer and is bound once:

```ts
PrismaPartnerRepository,
{ provide: PARTNER_REPOSITORY, useExisting: PrismaPartnerRepository },
{ provide: PARTNER_READER, useExisting: PrismaPartnerRepository },
```

- Keep `partnerInclude`, earliest owner selection, JSON-null-to-`{}` tolerance, list query/count
  semantics, and update `include` behavior exact. No query count changes on hot cross-module reads.
- Agreement `acceptedAt` continues to come from the DB `CURRENT_TIMESTAMP` default.
- Keep `PARTNER_REPOSITORY` as the only module export; `PARTNER_READER` remains internal.

**Verify/commit/review gate**

1. API typecheck + lint for the full partner module and both Listing consumers.
2. Commit Task 2.
3. Independent reviewer checks token/export identity, one Prisma singleton, Listing compatibility,
   RLS/admin boundaries, row-lock SQL, future-booking SQL/DB clock, column-granular writes, owner/list
   projection shape, and intentional temporary compatibility surface.
4. Fix/re-review before Task 3.

---

## Task 3 — Application and house creation through Partner

**Files**

- Refactor `application/use-cases/apply-as-partner.use-case.ts`
- Refactor `application/use-cases/create-house-partner.use-case.ts`
- Adjust the partner writer/repository only for creation intents

**Apply**

- Admin tenant lookup stays first; missing uses shared `TenantNotFound`. Domain active-tenant
  validation stays before address resolution/plan-limit/role lookup exactly where the current
  status gate runs.
- Preserve address-resolution output keys and null/default handling exactly.
- Preserve external ordering and one tenant tx. Inside it: slug pre-check/domain error → create
  aggregate intent → member → role → event → joined re-read.
- Do not move member/role assignment to another module/outbox. Keep the applicant as first member
  and the Partner Owner role in the same commit.
- Re-read after member insertion so the returned owner remains populated. Preserve the defensive
  `?? created` fallback.
- Permission invalidation stays awaited after commit; if it fails, the durable application remains
  committed and the request still fails as today.

**House**

- Preserve the controller's active-subscription + plan-limit guards.
- One tx: same slug pre-check, `Partner.createHouse`, insert, event. No membership, role, payout,
  identity, or extra agreement write.
- Leave concurrent slug `P2002` raw on both creation paths.

**Verify/commit/review gate**

1. API typecheck + partner lint + Listing consumer typecheck.
2. Commit Task 3.
3. Independent reviewer checks every pre-tx/tx/post-tx boundary, cross-module call ordering,
   administrative address shape, member/role atomicity, owner re-read, cache-failure semantics,
   house defaults/guards, event payload/order, raw uniqueness race, and the existing non-atomic
   Redis invalidation.
4. Fix/re-review before Task 4.

---

## Task 4 — Approval agreements + suspension through Partner

**Files**

- Refactor `application/use-cases/approve-partner.use-case.ts`
- Refactor `application/use-cases/suspend-partner.use-case.ts`
- Adjust partner writer/repository status methods only as needed
- Keep `domain/ports/agreement-repository.port.ts` and
  `infrastructure/repositories/prisma-agreement.repository.ts` externally compatible

**Approval**

- One tenant tx: load → not-found error → aggregate approval decision.
- Approved no-op returns the same loaded record before any status/agreement/event write.
- Real approval writes only status, then records exactly partner terms and commission schedule with
  unchanged `tenantId`, `partnerId`, actor `userId`, nullable `ip`, and version defaulting, then emits.
- Do not add agreement dedupe/uniqueness, status CAS, row lock, or retry.
- Keep the agreement port/class importable and independently instantiated by Promotions exactly as
  today.

**Suspension**

- One tenant tx: load/not-found → exact repository DB fact → aggregate decision → unconditional
  status-column write → event.
- Keep future-only confirmed range SQL and PostgreSQL `now()`. Do not load bookings, switch to
  app clock, add a status transition graph, or suppress already-suspended writes/events.

**Verify/commit/review gate**

1. API typecheck + partner/promotions/listing lint.
2. Commit Task 4.
3. Independent reviewer checks approved replay no-op, invalid-state message, agreement type/version/
   actor/IP/order/DB timestamp, Promotions port/class compatibility, Notification consumer
   compatibility, suspend SQL and DB clock, same-state emit, transaction/event ordering, and
   unchanged approval/suspension/P2025 races.
4. Fix/re-review before Task 5.

---

## Task 5 — Identity/profile policy transitions + compatibility wrappers + docs

**Files**

- Refactor `application/use-cases/submit-identity.use-case.ts`
- Refactor `application/use-cases/verify-identity.use-case.ts`
- Refactor `application/use-cases/update-payout-info.use-case.ts`
- Refactor `application/use-cases/update-partner-documents.use-case.ts`
- Refactor `application/use-cases/set-partner-default-cancellation-policy.use-case.ts`
- Refactor `application/assert-can-serve-listing-type.ts`
- Reduce `domain/partner-verification.ts` to compatible wrappers or delete only helpers with no
  remaining consumers
- Remove the temporary generic update surface from the port/repository
- Modify `apps/api/CLAUDE.md`

**Partner-scoped writes**

- Resolve tenant id on admin pool first; missing remains `PARTNER_NOT_FOUND`; then exactly one tenant
  tx. Do not shortcut through admin-pool writes.
- Submit identity remains no-pre-read and unconditional pending, with exact UTC-midnight DOB and
  complete identity blob; emit after the column write. It deliberately leaves any prior
  `verifiedAt` untouched.
- Payout remains no-pre-read whole-column replacement and does not invalidate an existing
  verification; emit after the update.
- Documents retains its current in-tx not-found check, merges only defined keys while preserving all
  legacy businessInfo keys, writes only that column, then emits.
- Default cancellation policy: no lookup for null; otherwise use the exact own-or-tenant-shared
  query behind the repository port in the same tx; persist only the FK column; no event.

**Identity review**

- Keep locked load and no-throw outcome protocol inside one tenant tx.
- Preserve not-found/no-pending/missing-DOB outcomes and under-18-before-name-mismatch.
- For rejection: persist rejected state + merged review metadata → emit reason payload → return
  outcome → commit → throw the typed 403 outside `forTenant`.
- For success: obtain the later app-clock sample for `verifiedAt`, persist verified state/metadata,
  emit, and return the updated record.
- Do not collapse review/verified clock sampling into a DB clock, add automatic payout rechecks, or
  make review errors throw inside the transaction.

**Compatibility/docs**

- `assertCanServeListingType` stays at the frozen path/signature and throws the same wire error,
  delegating to entity/domain policy.
- Delete only dead legacy helpers/types after `rg` proves no callers.
- Add both the already-merged `identity-access` omission and `partner` to the entity-style module
  list in `apps/api/CLAUDE.md`.

**Verify/commit/review gate**

1. API typecheck + full partner/listing/promotions lint + `git diff --check`.
2. Commit Task 5.
3. Independent reviewer checks row-lock/commit-then-throw, two clock boundaries, decision/error
   order, all JSONB column semantics, no extra reads on submit/payout, policy query ownership,
   Listing wrapper/token compatibility, public `verifiedAt` versus listing-status divergence, event
   payload/order, raw P2025 preservation on unguarded updates, known-gap preservation, dead helper
   proof, and docs accuracy.
4. Fix/re-review every finding.

---

## Final review and PR gate

1. Prepare a whole-branch review package from the plan commit to branch head: commit list, diff
   stat, frozen tables/seams, per-task review dispositions, and verification logs.
2. A reviewer separate from task implementers/reviewers audits the entire branch against the design
   spec, survey, and this plan. Carry no unresolved P0–P3 finding.
3. Run with Node 22.22.0:

```bash
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
pnpm turbo lint typecheck build
git diff --check refactor/entity-centric...HEAD
```

4. Manual runtime on a free API port:
   - list/get/public profile remain shape-identical and public descriptions still scrub contacts;
   - apply under an active tenant, confirm member/Partner Owner permission becomes usable after
     post-commit invalidation;
   - create house partner and confirm approved/company/house defaults;
   - approve pending and replay approval, confirming only the first call writes two agreements/event;
     confirm the live Notification consumer still processes `partner.approved`;
   - suspend with no future confirmed booking and exercise the active-booking rejection fixture if
     available;
   - submit identity, reject under-18/name mismatch and confirm rejected state persisted despite
     HTTP 403; then verify an eligible submission;
   - update payout/documents/default cancellation policy and confirm unrelated JSONB columns/keys
     survive;
   - promotion opt-in still records its `promo_funding` acceptance through the frozen partner port;
   - create/update a Listing path that reads `PARTNER_REPOSITORY` and exercises the frozen
     identity-verification wrapper.
5. Inspect DB/outbox rows only for event types/payloads/order and agreement acceptance count; do not
   expose payout account/document data or session cookies in the PR body/log excerpt.
6. PR base is `refactor/entity-centric`. The body must explicitly list anything not
   runtime-verified, the raw slug `P2002`, verified re-submission reset, payout-name no-recheck,
   stale `verifiedAt`/public-listing verification divergence, approval/suspension/cancellation/cache
   races, suspension same-state re-emit, admin-pool tenant resolution, cross-module Promotions
   agreement import, live Notification consumer, and app-clock/DB-clock split as preserved
   behavior/follow-up debt—not as fixes.
