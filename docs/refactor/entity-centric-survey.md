# Phụ lục khảo sát — Entity-centric refactor (2026-07-23)

> Sinh từ khảo sát tự động 16 module + shared infra (18 agent, đọc toàn bộ domain/application/infrastructure
> ngày 2026-07-23). Dùng làm nguồn cho implementation plan từng module. Design chính thức:
> [`docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md`](../superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md).

## Ràng buộc hạ tầng dùng chung

- forTenant tx flow: every tenant-scoped business operation runs inside exactly ONE interactive Prisma transaction opened by TenantDbService.forTenant(tenantId, fn) (apps/api/src/shared/tenant-context/tenant-db.service.ts:22-27). It executes `SELECT set_config('app.tenant_id', $id, true)` on that tx; the GUC is transaction-local, so any query outside that tx (or on another connection) silently loses RLS. Never nest forTenant, never call it per-query (apps/api/CLAUDE.md).
- Repositories take the tx, never the client: repository methods receive `PrismaTx` (Prisma.TransactionClient, exported from tenant-db.service.ts:6) as a parameter. The raw PrismaService pools (`prisma.app` RLS-bound app_user, `prisma.admin` BYPASSRLS app_admin — apps/api/src/shared/prisma/prisma.service.ts:13-23) are forbidden in business code; admin pool is only for cross-tenant work (webhooks, the outbox relay, reconciliation).
- DB clock authority: business deadlines/comparisons must use `TenantDbService.databaseNow(tx)` (`SELECT now()`, tenant-db.service.ts:35-40) — never Date.now()/utcNow() for anything the DB also compares. outbox_events.available_at is `dbgenerated("CURRENT_TIMESTAMP")` for exactly this reason (schema.prisma:1857-1860); the relay claims with `available_at <= now()` (outbox-relay.worker.ts:71) and reschedules with `now() + make_interval(...)` (line 122).
- Outbox emit inside the same tx: OutboxService.emit(tx, {tenantId?, eventType, payload}) is a plain `tx.outboxEvent.create` (apps/api/src/shared/outbox/outbox.service.ts:18-26) — the state change and its event commit or roll back atomically. Modules never import each other's code; cross-module effects go only through outbox events (ADR 0003).
- At-least-once outbox delivery: the BullMQ relay (apps/api/src/shared/outbox/outbox-relay.worker.ts) polls every 2s, claims batches of 20 with FOR UPDATE SKIP LOCKED + pushes available_at forward 60s, runs ALL registered handlers for an event, and marks processed_at only after every handler succeeded (lines 103-113). Any handler failure retries the WHOLE event with exponential backoff capped at 300s, no dead-letter — so every handler must be idempotent and tolerate re-execution after a sibling handler already ran. Handler ordering within an event_type is registration order (outbox-handler.registry.ts); payload is `unknown` at dispatch (outbox.types.ts).
- RLS GUC enforcement: every tenant-scoped table has tenant_id uuid NOT NULL + FORCE ROW LEVEL SECURITY + a `tenant_isolation` policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)` created in hand-written migrations (prisma/migrations/20260709000001_rls_domain_and_constraints/migration.sql:22-78). USING doubles as INSERT WITH CHECK: writes with the wrong tenant_id are rejected by the DB, and reads of other tenants return empty (not errors). `check:rls` (static script, CI) fails if a table is missed. Migrations are hand-authored, never `prisma migrate dev` (ADR 0004).
- Money is bigint VND: all amounts are Prisma BigInt columns (Booking.totalAmount/finalAmount/depositAmount/paidAmount/securityDeposit/damageAmount schema.prisma:1107-1122; Payment.amount:1351; LedgerEntry.debit/credit:1481-1482; Listing.rescheduleFee:958; PricingRule.price:1007). Domain helpers in apps/api/src/shared/money/money.ts: `Vnd = bigint`, `vnd()` rejects non-integers, `percentOfBps()` does basis-point math with half-up rounding in pure bigint — no floats ever. Zod contracts serialize money as decimal strings (`finalAmount: z.string()` in packages/contracts/src/contracts/booking.ts:237; mappers call `.toString()` e.g. apps/api/src/modules/booking/application/partner-calendar.mapper.ts:31-36).
- Rates are integer percent 0-100 (or bps where documented): Listing.depositPercent Int (schema.prisma:954), Booking.refundPercent Int with DB CHECK BETWEEN 0 AND 100 (migrations/20260719120000_finance_lifecycle_hardening/migration.sql:40-41), CommissionRule.platformRate Int (schema.prisma:1439); commissionRule tenantRate/affiliateRate are BigInt with RateType percent|fixed semantics (schema.prisma:1435-1441). Fractional math goes through percentOfBps, never floating point.
- Time is timestamptz UTC: every temporal column is `@db.Timestamptz(6)` in UTC; tenant/resource IANA timezones apply only at presentation/slot-computation edges via Intl helpers (apps/api/src/shared/time/time.ts: wallClockInZone, zonedTimeToUtc; DEFAULT_TIMEZONE 'Asia/Ho_Chi_Minh'). Tenant default timezone is read inside the caller's tx via resolveTenantTimezone(tx, tenantId) (apps/api/src/shared/tenant-context/tenant-timezone.ts).
- GiST double-booking exclusion: bookings.timeslot and bookings.blocked_period are `Unsupported("tstzrange")` (schema.prisma:1100-1102), invisible to the Prisma client — repositories write/query them via raw SQL `tstzrange(start, end, '[)')` (apps/api/src/modules/booking/infrastructure/repositories/prisma-booking.repository.ts:161-172,265,477). The DB constraint `bookings_no_overlap EXCLUDE USING gist (resource_id WITH =, blocked_period WITH &&) WHERE status IN ('pending_payment','pending_approval','confirmed') AND booking_mode NOT IN ('inventory','class')` (migrations/20260709000001:84-90) is the ONLY hard guarantee against double booking; it is keyed on resource (not listing) and fires as a 23P01 exclusion violation at INSERT/UPDATE time. inventory/class modes use atomic counting instead.
- Ledger double-entry is DB-trigger-enforced (migrations/20260709000001:92-129): (a) CHECK ledger_entries_one_sided — exactly one of debit/credit > 0 per line; (b) BEFORE UPDATE OR DELETE trigger raises — ledger_entries is append-only, corrections are reversing entries; (c) CONSTRAINT TRIGGER ledger_journal_balance_check, DEFERRABLE INITIALLY DEFERRED, validates SUM(debit)=SUM(credit) per journal_id at COMMIT — all lines of a journal must be inserted inside one transaction. LedgerEntry.availableAt is explicit payout maturity, never inferred from created_at (schema.prisma:1487-1488).
- Zod contracts are the FE↔BE boundary: request/response shapes live in packages/contracts/src/contracts/*.ts (zod + inferred types, built to dist). Validation happens at the HTTP edge only — global ZodDtoValidationPipe over createZodDto classes plus per-route ZodValidationPipe (apps/api/src/shared/validation/zod-dto-validation.pipe.ts, zod-validation.pipe.ts), both emitting the {statusCode:400, code:'VALIDATION_ERROR', message, details} envelope. Response mapping (bigint→string, Date→ISO) lives in application/<module>.mapper.ts, never in controllers/use-cases.
- Tenant identity comes from AsyncLocalStorage request context, not client input: TenantContextService (apps/api/src/shared/tenant-context/tenant-context.service.ts) is filled by the auth layer after verifying role assignments; forCurrentTenant reads it (tenant-db.service.ts:30-32). The outbox relay re-establishes it per event via tenantContext.run({tenantId}) before invoking handlers (outbox-relay.worker.ts:105).
- Architecture rules that bound the refactor: controller → use-case → repository-port → repository, no service classes in the application layer (ADR 0006); one use-case = one file with a single public execute(); pure computation belongs in domain/ as plain functions (no DI); PKs are uuid v7 generated by the DB (`@default(uuid(7))`); NO TESTS ever (ADR 0005) — verification is typecheck + lint + build + running the app.

### Hệ quả cho thiết kế entity

- Aggregates must be persistence-free and tx-agnostic: because the tx is opened by the use-case via forTenant and handed to repositories, an aggregate can never load or save itself, hold a PrismaTx, or lazy-load. The use-case orchestrates: open forTenant → repo.load(tx) → hydrate aggregate → aggregate mutates in memory → repo.save(tx, aggregate) → outbox.emit(tx, events) — all inside the one closure. An aggregate method that 'needs more data' means the use-case must fetch it first and pass it in.
- Aggregates never generate 'now' themselves: any time-sensitive invariant (hold expiry, cancellation windows, payout maturity, refund deadlines) must take `now: Date` as an explicit method parameter, supplied by the use-case from `tenantDb.databaseNow(tx)` — not new Date()/utcNow(). This also keeps domain functions pure and deterministic. utcNow()/addMinutes in shared/time are fine for non-DB-compared values only.
- Aggregate invariants are the first line, DB constraints the last: the GiST exclusion, ledger balance trigger, one-sided CHECK, refund_percent CHECK, and RLS WITH CHECK all still fire at COMMIT/INSERT. Aggregates should pre-validate for good error messages, but repositories/use-cases MUST still translate the DB violations (23P01 exclusion overlap → 'slot taken' conflict; deferred trigger failure at commit) into domain errors — the constraint firing is expected under concurrency, not a bug. Never treat a passing aggregate check as sufficient for double-booking; the DB constraint is the only race-proof arbiter.
- A ledger 'Journal' aggregate must produce ALL its balanced lines as one unit: because the balance trigger is deferred-to-commit and entries are append-only, the aggregate should expose an immutable value-object list of lines (debit=credit by construction, one-sided per line, bigint math via percentOfBps) that the repository inserts in a single tx. There is no update/delete path — 'corrections' are a new reversing journal emitted by the aggregate, never mutation of persisted state. availableAt (payout maturity) is an explicit aggregate decision, not defaulted.
- Booking aggregate must model timeslot/blockedPeriod as domain value objects ({start, end} half-open [) intervals) since Prisma cannot represent tstzrange: hydration and persistence of these fields is raw-SQL repository work (prisma-booking.repository.ts pattern), so the repository is the mapping boundary between `Unsupported("tstzrange")` and the VO. blocked_period (timeslot + snapshotted buffer) is computed in the domain but only 'reserved' once the INSERT survives the GiST constraint.
- Money and rates are value objects on bigint: aggregates must hold Vnd (bigint) internally and use shared/money helpers (vnd, percentOfBps) for arithmetic — never number for amounts. Percent rates enter aggregates as validated integers (0-100) or bps; DB CHECKs (e.g. refund_percent BETWEEN 0 AND 100) mirror but don't replace VO validation. Serialization to string happens only in application mappers against packages/contracts zod schemas — entities never emit JSON.
- Domain events belong to the aggregate, persistence of them to the use-case: an aggregate should collect events (e.g. pullDomainEvents()) during mutation; the use-case drains them into OutboxService.emit(tx, …) inside the same forTenant tx before returning. Event payloads must be self-contained JSON (Prisma.InputJsonValue — so bigint amounts serialized as strings, dates as ISO) because the consumer only receives {id, tenantId, eventType, payload, attempts} with payload typed unknown.
- Event handlers that rehydrate aggregates must be idempotent: at-least-once delivery + all-handlers-retry-together means a handler may re-run after partial success. Aggregate state transitions triggered by events need natural idempotency keys (e.g. unique journal per booking+event, upsert-by-natural-key, status guards that no-op on replay) — the design cannot assume exactly-once. Handlers run inside tenantContext.run({tenantId}) and should open their own forTenant tx (a NEW transaction — the original producing tx is long gone).
- Aggregates never see tenant_id as a security mechanism, but must still carry it: every persisted row needs tenantId (RLS WITH CHECK rejects mismatches), so entity constructors/factories take tenantId as an identity field. However, cross-tenant leaks are already impossible inside forTenant — aggregate code should not re-filter by tenant defensively, and repository queries under the tx can rely on RLS scoping. Admin-pool repositories (webhook/relay paths) are the exception and must filter explicitly.
- Timezone logic stays at the edges of the aggregate: entities store/compare UTC Dates only; converting to tenant/resource wall-clock (availability rules, slot generation) uses shared/time zone helpers with a timezone the use-case resolved via resolveTenantTimezone(tx, tenantId) and passed in. An aggregate never queries for its own timezone.
- Hydration mapping lives in the repository adapter, contract mapping in the application mapper — two distinct boundaries: infrastructure/repositories/* convert Prisma rows (incl. raw-SQL tstzrange, BigInt) ⇄ domain entities/VOs; application/<module>.mapper.ts converts entities → contract DTOs (bigint→string, Date→ISO) validated by packages/contracts. Zod schemas must NOT leak into domain/entities, and Prisma types must not leak past the repository port signatures.
- File-shape constraints for the refactor: rich entities go in modules/<m>/domain/entities/ as plain classes/pure functions with no DI and no Nest decorators (ADR 0006 alternatives); reusable multi-aggregate operations become injectable use-cases, not domain services; anything needing infra (crypto, gateway API) becomes a port in domain/ports/ + adapter in infrastructure/. One use-case per file with single execute() still routes every aggregate interaction — aggregates cannot be invoked from controllers directly.

## Chi tiết từng module

### reviews — effort S (8 use-cases, 8 endpoints)

**domain/ hiện tại:**
- domain/review-media.ts — 3 pure functions: extension→ReviewMediaKind map, reviewMediaPrefix(tenantId,customerId,bookingId), isReviewMediaKeyInScope; the ONLY domain logic in the module (no entities/ dir)
- domain/ports/review-repository.port.ts — REVIEW_REPOSITORY symbol + fat read-record types (ReviewRecord w/ joined listingTitle/partnerName/customerName/reply, PendingReviewRecord, ReviewSummaryRecord, page shapes) + IReviewRepository mixing writes (create, reply), eligibility probe (isReviewableBooking) and 4 list projections
- domain/ports/review-tenant-reader.port.ts — REVIEW_TENANT_READER symbol; resolveTenantId(host) storefront Host→tenantId resolver
- domain/ports/admin-review-reader.port.ts — ADMIN_REVIEW_READER symbol; cross-tenant read-only list port (AdminReviewRecord = ReviewRecord + tenantName)

**Aggregate sau refactor:**
- **Review** — Single aggregate root: a verified per-booking review. Owns write state: id, tenantId, bookingId (unique), snapshot refs (listingId, groupId, partnerId, customerId), rating 1–5, content, immutable media list (kind/key/url VOs, max 5), and child entity ReviewReply (0..1: partnerId, authorUserId, content). Creation needs a narrow BookingSnapshot (customerId, status, listingId, partnerId, listing.groupId) fetched via port. Pending-review lists, summaries, distributions, admin/tenant/partner/public lists are read projections — stay outside. Suggested shape: static create(bookingSnapshot, customerId, rating, content, mediaKeys) returning Review | error-reason; static rehydrate(writeState); reply(partnerId, authorUserId, content): boolean (idempotent no-throw).
  - Invariants:
    - I1: only an owned booking (customerId match) with status='completed' and no existing review may be reviewed
    - I2: at most one review per booking (bookingId unique)
    - I3: rating is an integer 1–5
    - I4: media: max 5 items, no duplicate keys, extension must map to image/video, every key must be inside the reviews/{tenantId}/{customerId}/{bookingId}/ prefix (no '..')
    - I5: review is immutable after creation (no update/delete paths; media JSON documented immutable)
    - I6: at most one reply per review, and only the partner who owns the review may reply
    - I7: listingId/groupId/partnerId are snapshotted from the booking at creation (never client-supplied)
  - Đang enforce tại:
    - I1: apps/api/src/modules/reviews/infrastructure/repositories/prisma-review.repository.ts:183 (isReviewableBooking where-clause) and :201 (create where-clause, copy-paste); surfaced as 409 in application/use-cases/create-review.use-case.ts:66-72 and create-review-media-upload.use-case.ts:44-50
    - I2: DB unique reviews_booking_id_key — apps/api/prisma/migrations/20260719150000_reviews_and_review_aggregates/migration.sql:21; P2002 catch in create-review.use-case.ts:81-87; also implied by review:null in repository where-clauses :183/:201
    - I3: zod contracts packages/contracts/src/contracts/review.ts:4 (reviewRatingSchema, via DTO pipe) + DB CHECK reviews_rating_check migrations/20260719150000.../migration.sql:22; nowhere in domain code
    - I4: dup-keys create-review.use-case.ts:47-50; kind+scope loop create-review.use-case.ts:51-57 calling domain/review-media.ts:19-26; max-5 in contracts review.ts:67 + DB CHECK migrations/20260722120000_review_media/migration.sql:6
    - I5: nowhere explicit — enforced only by absence of update endpoints; schema doc comment prisma/schema.prisma:1182
    - I6: repository where-clause prisma-review.repository.ts:235 ({id, partnerId, reply:null}) + DB unique review_replies_review_id_key migrations/20260719150000.../migration.sql:41; P2002 catch reply-review.use-case.ts:52-58
    - I7: repository create prisma-review.repository.ts:200-221 (booking lookup :200-208, groupId/partnerId taken from booking at :213-216)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/reviews/application/use-cases/create-review.use-case.ts:47-50 — duplicate-media-key business rule validated inline in use-case
- apps/api/src/modules/reviews/application/use-cases/create-review.use-case.ts:51-57 — media kind/scope validation + media-VO assembly (kind, key, url) inline in use-case
- apps/api/src/modules/reviews/application/use-cases/create-review.use-case.ts:66-72 — eligibility outcome inferred from repo returning null; the rule itself is invisible to the domain layer
- apps/api/src/modules/reviews/application/use-cases/create-review.use-case.ts:81-87 — one-review-per-booking rule exists only as a Prisma P2002 catch mapped to REVIEW_ALREADY_EXISTS
- apps/api/src/modules/reviews/application/use-cases/create-review-media-upload.use-case.ts:41-50 — reviewability eligibility branch duplicating create-review's rule (second consumer of the hidden repo rule)
- apps/api/src/modules/reviews/application/use-cases/reply-review.use-case.ts:37-43 — reply eligibility (missing / already replied / wrong partner) inferred from repo null, three distinct reasons collapsed into one 409
- apps/api/src/modules/reviews/application/use-cases/reply-review.use-case.ts:52-58 — reply-once rule exists only as a P2002 catch
- apps/api/src/modules/reviews/infrastructure/repositories/prisma-review.repository.ts:183 — reviewability invariant (ownership + status='completed' + review:null) encoded as a repository where-clause
- apps/api/src/modules/reviews/infrastructure/repositories/prisma-review.repository.ts:201 — same invariant copy-pasted into create()'s where-clause
- apps/api/src/modules/reviews/infrastructure/repositories/prisma-review.repository.ts:260 — third copy of the {status:'completed', review:null} rule fragment (pending-review list where-clause)
- apps/api/src/modules/reviews/infrastructure/repositories/prisma-review.repository.ts:210-221 — snapshot/denormalization decision (listingId/partnerId from booking, groupId from booking.listing) made inside the repository, not the domain
- apps/api/src/modules/reviews/infrastructure/repositories/prisma-review.repository.ts:235 — reply eligibility (partner ownership + reply:null) as repository where-clause

**Port hiện tại:** Fat read-record port. IReviewRepository (domain/ports/review-repository.port.ts:83-107) mixes: write methods create()/reply() that take primitives + positional string ids and return the FAT read record ReviewRecord (18 joined/display fields: bookingCode, listingTitle, partnerName, customerName, reply, serviceCompletedAt...) or null-as-business-failure; a boolean eligibility probe isReviewableBooking(); and 4 read projections (listCustomer/listPublic/listPartner/listTenant) with summary aggregates. All methods take PrismaTx as first arg (correct per convention). No write-state record, no save(aggregate), no applyTransition-style conditional-update methods — business-rule failure is signaled by returning null from where-clause misses, and uniqueness by letting P2002 escape to the use-case. Separate read-only ports: IAdminReviewReader (admin pool, no tx) and IReviewTenantReader (host→tenantId, admin pool). Media modeled as pre-built ReviewMediaRecord[] passed into create.

**Outbox:** produces: review.created — create-review.use-case.ts:73-77, payload {reviewId, listingId, groupId}, inside forTenant tx, review.replied — reply-review.use-case.ts:44-48, payload {reviewId, bookingId}, inside forTenant tx (currently has NO registered consumer anywhere) · consumes: (none)

**Rủi ro refactor:**
- Cross-module table reads: the repo reads tx.booking / tx.listing / tx.listingGroup / tx.partner directly (prisma-review.repository.ts:200, :182, :324, :331, :338) — a rich aggregate needs a narrow BookingSnapshot port instead; must NOT become an import from the booking module (outbox-only rule, ADR 0003)
- Atomicity/TOCTOU: today eligibility is a where-clause on the INSERT path inside one forTenant tx; splitting into load-snapshot → aggregate.decide → insert keeps the bookingId-unique backstop (P2002) but the status='completed' check becomes read-then-write — keep both inside the same tx and keep the P2002 translation as the last line of defense
- DB constraints remain the real enforcers of I2/I3/I4-max5 (reviews_booking_id_key, reviews_rating_check, review_media jsonb CHECK) — aggregate checks are additive; do not drop the P2002 catches
- Outbox consumer coupling: listing module's ProjectReviewAggregatesUseCase registered for 'review.created' (listing/infrastructure/http/listing.module.ts:171-176) depends on payload {listingId, groupId} and event.tenantId (with a fragile ?? '' fallback) — changing event payload shape breaks listing/group ratingAvg/reviewCount projection; handler must stay idempotent (it recomputes, so re-delivery is safe)
- RLS: reviews + review_replies are FORCE RLS (migration 20260719150000:57-67); PrismaAdminReviewReader and PrismaReviewTenantReader use prisma.admin (BYPASSRLS) outside forTenant — keep both read paths outside the aggregate and outside the tenant tx
- Host-based tenant resolution happens before forTenant in 4 storefront use-cases — a refactor must not fold it into the tx
- Raw SQL projection bookingTimes (prisma-review.repository.ts:88-100) reads lower(timeslot)/upper(timeslot) off bookings' tstzrange — GiST/range schema drift in the booking module silently breaks customer list times; keep as read projection, not aggregate state
- Media URL is baked into the stored JSON at create time via storage.publicUrlForKey (create-review.use-case.ts:56) — if the aggregate is changed to store keys only, stored rows and parseReviewMedia (repository.ts:69-80) must stay backward-compatible
- DB clock: createdAt/updatedAt are DB defaults (now()); pending-list ordering uses updatedAt fallback (repository.ts:307) — don't introduce Date.now() into aggregate transitions
- No money/bigint, no ledger triggers, no webhooks in this module — those risk classes are absent

### content-reports — effort S (4 use-cases, 4 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/content-reports/domain/ports/content-report-repository.port.ts — DI symbol + fat read record types (ReportTargetRecord, ContentReportRecord, ContentReportPage) + IContentReportRepository with 7 tx-first methods; no entity, no behavior; leaks @booking/contracts types (CreateContentReportInput, TenantContentReportsQuery, ContentReportStatus) into domain
- apps/api/src/modules/content-reports/domain/ports/content-report-tenant-reader.port.ts — DI symbol + IContentReportTenantReader.resolveTenantId(host) for storefront Host→tenantId resolution; no entity
- (no domain/entities/ directory exists — the domain layer is ports-only)

**Aggregate sau refactor:**
- **ContentReport** — A customer's moderation report against a published listing or listing group, with denormalized target/partner/reporter snapshots (survives target deletion), a reason+details, and a moderation lifecycle open → reviewing → resolved|dismissed handled by a tenant moderator. Single aggregate for the whole module; the reportable-target lookup and reporter-name lookup are cross-module reads that must stay as port queries (ACL), not aggregate state.
  - Invariants:
    - Create only against a published listing/group whose partner is approved — apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:52 and :72 (where { status: 'published', partner: { status: 'approved' } }); null-checked in apps/api/src/modules/content-reports/application/use-cases/create-content-report.use-case.ts:39-44
    - reason='other' requires details >= 20 chars — packages/contracts/src/contracts/content-report.ts:27-35 (zod superRefine only; nowhere in api src)
    - At most one ACTIVE (open|reviewing) report per (tenant, reporter, target) — DB partial unique index apps/api/prisma/migrations/20260721140000_content_reports/migration.sql:44-46; app-side check-then-create in prisma-content-report.repository.ts:102-110 with createMany skipDuplicates at :112-131 (duplicate := count===0 at :131)
    - Terminal transition (resolved|dismissed) requires resolutionNote >= 10 chars — packages/contracts/src/contracts/content-report.ts:43-53 (zod superRefine only; nowhere in api src)
    - handledAt is set iff status is terminal (cleared when moved back to open/reviewing); handledByUserId stamped on every status change — prisma-content-report.repository.ts:186-194 (terminal computed at :186, handledAt: terminal ? new Date() : null at :194)
    - Status-transition legality (e.g. forbid resolved→open, or define reopen explicitly) — enforced NOWHERE today: update-content-report.use-case.ts:33-39 writes any status over any status with no guard
    - Every status change carries an audit record with from/to statuses — apps/api/src/modules/content-reports/application/use-cases/update-content-report.use-case.ts:40-53 (AUDIT_WRITER port; current loaded at :26 solely to capture fromStatus)
  - Đang enforce tại:
    - apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:52
    - apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:72
    - apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:102-131
    - apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:186-194
    - apps/api/src/modules/content-reports/application/use-cases/create-content-report.use-case.ts:39-50
    - apps/api/src/modules/content-reports/application/use-cases/update-content-report.use-case.ts:26-53
    - apps/api/prisma/migrations/20260721140000_content_reports/migration.sql:44-46
    - packages/contracts/src/contracts/content-report.ts:27-35
    - packages/contracts/src/contracts/content-report.ts:43-53

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:186 — domain rule 'terminal = resolved|dismissed' computed inside the repository; belongs in the aggregate's transition method
- apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:194 — repository decides handledAt (set-iff-terminal, app-clock new Date()); a state-derivation rule living in infra
- apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:102-110 — the definition of 'active report' (status in open|reviewing) as a duplicate-blocker is encoded as a repo where-clause; the same rule fragment is copy-pasted into the DB partial index (migration.sql:44-46) with no single domain source
- apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:131 — 'duplicate' business semantics derived from createMany count===0 inside the repo
- apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts:52 and :72 — 'reportable target = published + approved partner' business precondition exists only as two copy-pasted Prisma where fragments
- apps/api/src/modules/content-reports/application/use-cases/update-content-report.use-case.ts:33-39 — anemic gap: loads current state (:26) yet applies no transition-legality check before overwriting status; resolved→open, dismissed→resolved etc. all pass silently
- packages/contracts/src/contracts/content-report.ts:43-53 — write-invariant (terminal status requires resolutionNote>=10) lives only in the transport zod schema; the domain/application layer would accept a terminal status with null note if called from anywhere but the HTTP DTO pipe
- packages/contracts/src/contracts/content-report.ts:27-35 — same for reason='other' requires details>=20; nothing in the module re-enforces it

**Port hiện tại:** Record-type + primitives, tx-first, CRUD-verb granularity. IContentReportRepository (content-report-repository.port.ts:46-70) takes PrismaTx as first arg on all 7 methods; state crosses the port as one fat read record (ContentReportRecord, :20-38 — full row incl. Date timestamps and denormalized snapshots) used for both reads and write returns; there is no narrow write-state interface and no save(aggregate)/applyTransition-style method. Writes are intent-named but primitive-parameterized: createOrFindActive(tenantId, reporterUserId, reporterName, target, input) takes the raw contracts DTO, and updateStatus(id, status, resolutionNote, handledByUserId) takes loose primitives, letting the repo compute domain state (terminal/handledAt). Read projection (list with page/total/status-counts, ContentReportPage :40-44) flows through the same port as writes — no reader/writer split. Contracts types (ContentReportStatus, CreateContentReportInput, TenantContentReportsQuery) are imported directly into the domain port. Second port IContentReportTenantReader is a one-method infra lookup implemented on the BYPASSRLS admin pool.

**Outbox:** produces: (none) · consumes: (none)

**Rủi ro refactor:**
- Duplicate-prevention is concurrency-safe only via the DB partial unique index (migration.sql:44-46) + createMany skipDuplicates + re-fetch (prisma-content-report.repository.ts:112-131). If the aggregate refactor swaps this for a plain create() after an in-aggregate 'no active duplicate' check, concurrent submits will surface Prisma P2002 instead of the graceful { duplicate: true } response — the skipDuplicates/re-fetch pattern (or a P2002 catch) must survive the refactor.
- App-clock usage: handledAt uses new Date() (prisma-content-report.repository.ts:194) — project convention prefers DB clock (now()). Moving this into the aggregate either bakes in app-clock (convention violation persists) or needs a clock passed in; silently switching to DB now() changes write behavior.
- The partial unique index only guards rows WHERE reporter_user_id IS NOT NULL; schema allows anonymous reports (reporterUserId nullable, ON DELETE SET NULL). An aggregate whose write-state assumes non-null reporterUserId will break rehydrate() on rows whose reporter was deleted — the rehydrate state interface must keep reporterUserId/partnerId/handledByUserId nullable.
- Cross-module reads: findPublishedTarget queries listing/listing_groups tables and getReporterName queries users (prisma-content-report.repository.ts:45-92) — these violate 'modules never import each other's code' only at the table level and must remain port-level ACL queries; do NOT pull the published/approved check into the ContentReport aggregate as if it owned that state.
- Tenant resolution runs on the BYPASSRLS admin pool outside forTenant (prisma-content-report-tenant.reader.ts:12) by design; everything else must stay inside a single forTenant tx — do not fold resolveTenantId into the same tx or nest forTenant.
- Adding transition-legality guards (the natural aggregate move) is a behavior change: today PATCH allows any→any status, and the dashboard moderation UI may rely on reopening resolved/dismissed reports; a no-throw boolean transition also changes the current always-200 PATCH contract and must be mapped to an explicit 409/422 decision.
- Audit coupling: audit.write needs fromStatus pre-image (update-content-report.use-case.ts:40-53); the aggregate transition must expose the previous status (return value or recorded event) or the audit trail silently loses from/to accuracy.
- Invariants 2 and 4 currently live only in @booking/contracts zod superRefines consumed by both frontends; duplicating them inside the aggregate creates a drift risk between contracts and domain — keep contracts as the FE-facing source and mirror deliberately.
- No bigint money, no ledger triggers, no GiST exclusion, no webhooks, no outbox handlers in this module — those risk classes are absent here; RLS risk is limited to keeping repository-takes-tx and the existing forTenant-per-operation shape unchanged.

### notification — effort S (6 use-cases, 0 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/notification/domain/notification-plan.ts — pure routing policy: NotificationTemplateId union, event-type constant arrays for outbox registration, and planForEvent(eventType,payload) mapping an event to {audience,template} items (incl. booking.created branch on status)
- apps/api/src/modules/notification/domain/email-template.ts — pure bilingual vi/en template catalog (16 templates) + TemplateData shape + renderEmail() interpolation/HTML-escaping + locale normalization
- apps/api/src/modules/notification/domain/booking-notification-data.ts — pure helpers: audienceRecipients(item,ctx) and bookingTemplateData(ctx,recipient,payload) which formats VND (BigInt-parses refundAmount string) and start time in tenant timezone
- apps/api/src/modules/notification/domain/ports/email-sender.port.ts — IEmailSender transport port: send(EmailMessage) with primitive to/subject/text/html
- apps/api/src/modules/notification/domain/ports/notification-log-repository.port.ts — INotificationLogRepository write port: NotificationLogRecord flat record (string-union status, dedupeKey) + alreadySent(dedupeKey) / record(entry)
- apps/api/src/modules/notification/domain/ports/notification-reader.port.ts — INotificationReader projection port: Booking/Listing/Partner NotificationContext read records (bigint finalAmount, recipient lists) + cross-tenant findUpcomingConfirmed(from,to); tenant-scoped methods take PrismaTx

**Aggregate sau refactor:**
- **NotificationDelivery** — The only stateful entity in the module: one notification_logs row = one attempted delivery (channel email, Phase 1). Owns identity (deterministic dedupeKey), lifecycle pending→sent|failed, sentAt/error fields, and the per-channel failure policy (outbox path rethrows for relay retry; OTP path swallows). Target shape: static create(event, recipient, templateId) computes the dedupe key; markSent()/markFailed(error) are idempotent boolean transitions; alreadySent stays a repo-level uniqueness question backed by a DB unique index. Rendering (renderEmail) and context projection stay outside the aggregate.
  - Invariants:
    - At-most-once send per dedupe key across outbox redeliveries and overlapping reminder sweeps
    - Dedupe key is deterministic: eventType:aggregateId:templateId:userId (OTP variant appends the code)
    - sentAt is set iff status='sent'; error recorded iff status='failed'
    - Every send attempt (success or failure) is recorded in notification_logs before the outcome propagates
    - Failure policy per trigger: outbox-driven delivery records 'failed' then rethrows so the relay retries; synchronous OTP records 'failed' and swallows (best-effort)
    - Channel is fixed to 'email' in Phase 1
  - Đang enforce tại:
    - apps/api/src/modules/notification/application/deliver-notification.ts:37 (alreadySent guard — read-then-write, race-prone)
    - apps/api/src/modules/notification/infrastructure/repositories/prisma-notification-log.repository.ts:18-24 (dedupe lookup via payload->>'dedupeKey'; NO unique DB constraint exists — prisma/migrations/20260709000000_full_domain_model/migration.sql:660-673 has only PK + tenant/user indexes)
    - apps/api/src/modules/notification/application/use-cases/dispatch-booking-event.use-case.ts:50 (key format, copy 1)
    - apps/api/src/modules/notification/application/use-cases/dispatch-listing-event.use-case.ts:43 (copy 2)
    - apps/api/src/modules/notification/application/use-cases/dispatch-partner-event.use-case.ts:42 (copy 3)
    - apps/api/src/modules/notification/application/use-cases/dispatch-payout-event.use-case.ts:49 (copy 4)
    - apps/api/src/modules/notification/application/use-cases/dispatch-reminder.use-case.ts:39 (copy 5, different shape: no templateId segment)
    - apps/api/src/modules/notification/application/use-cases/send-booking-otp.use-case.ts:51 (copy 6, appends otp)
    - apps/api/src/modules/notification/infrastructure/repositories/prisma-notification-log.repository.ts:36 (sentAt iff sent, app clock new Date())
    - apps/api/src/modules/notification/application/deliver-notification.ts:46-71 (record-then-rethrow failure policy)
    - apps/api/src/modules/notification/application/use-cases/send-booking-otp.use-case.ts:52-83 (duplicated send/record with swallow policy)
    - apps/api/src/modules/notification/application/deliver-notification.ts:49 and send-booking-otp.use-case.ts:62 (channel 'email' hardcoded)
- **NotificationPlan (domain policy object, not persisted)** — Already mostly a pure domain function (planForEvent). Should become the single routing authority absorbing the routing decisions that currently leak into use-cases: payout payee-type filter, the hardcoded payout/reminder plan items, and audience→recipients resolution.
  - Invariants:
    - Each event type maps to a fixed audience+template set; booking.created branches on payload.status ('pending_approval' → partner approval template, else customer payment template)
    - payout.paid notifies only payeeType='partner' (affiliates have no Phase-1 template)
    - Reminder targets only the customer of a confirmed, non-inventory booking in the T−24h band
    - Audience 'customer' resolves to the booking customer (may be absent → skip); audience 'partner' resolves to all partner members
  - Đang enforce tại:
    - apps/api/src/modules/notification/domain/notification-plan.ts:63-99 (planForEvent — already domain)
    - apps/api/src/modules/notification/application/use-cases/dispatch-payout-event.use-case.ts:35 (payee-type filter in use-case)
    - apps/api/src/modules/notification/application/use-cases/dispatch-payout-event.use-case.ts:40 (payout plan item hardcoded, bypasses planForEvent)
    - apps/api/src/modules/notification/application/use-cases/dispatch-reminder.use-case.ts:35-38 (reminder plan item hardcoded)
    - apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts:100-101 (confirmed + booking_mode <> 'inventory' + time-band rule in raw SQL WHERE)
    - apps/api/src/modules/notification/infrastructure/reminder.worker.ts:11-12,46-48 (T−24h lead + 60-min band constants and window math in worker, app clock)
    - apps/api/src/modules/notification/domain/booking-notification-data.ts:15-21 (audienceRecipients — already domain)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/notification/application/use-cases/dispatch-payout-event.use-case.ts:35 — business branching `if (payload.payeeType !== 'partner') return` (who gets payout emails) in use-case instead of the plan policy
- apps/api/src/modules/notification/application/use-cases/dispatch-payout-event.use-case.ts:40 — routing decision (audience/template for payout.paid) hardcoded inline, bypassing planForEvent
- apps/api/src/modules/notification/application/use-cases/dispatch-payout-event.use-case.ts:42 — locale rule `recipient.locale === 'en' ? 'en' : 'vi'` duplicates domain normalizeLocale (email-template.ts:35-37)
- apps/api/src/modules/notification/application/use-cases/dispatch-payout-event.use-case.ts:47 — computed amount `formatVnd(BigInt(payload.amount), locale)` in use-case instead of a domain data builder (parallel to bookingTemplateData)
- apps/api/src/modules/notification/application/use-cases/dispatch-reminder.use-case.ts:35-38 — reminder routing (audience/template) hardcoded in use-case
- apps/api/src/modules/notification/application/use-cases/dispatch-booking-event.use-case.ts:50, dispatch-listing-event.use-case.ts:43, dispatch-partner-event.use-case.ts:42, dispatch-payout-event.use-case.ts:49, dispatch-reminder.use-case.ts:39, send-booking-otp.use-case.ts:51 — the dedupe-key identity rule copy-pasted 6 times with 3 different shapes; the aggregate's core invariant lives as string templates in use-cases
- apps/api/src/modules/notification/application/deliver-notification.ts:37 — the at-most-once invariant check (alreadySent) lives in an application helper, not the entity/persistence layer, and is not backed by any DB constraint
- apps/api/src/modules/notification/application/use-cases/send-booking-otp.use-case.ts:48 — computed value `Math.max(1, Math.round(expiresInSec / 60))` (OTP expiry presentation rule) in use-case
- apps/api/src/modules/notification/application/use-cases/send-booking-otp.use-case.ts:52-83 — full copy of deliverNotification's send/record/failure sequence with a divergent (swallow) failure policy; the policy difference is implicit in duplication, not modeled
- apps/api/src/modules/notification/infrastructure/repositories/prisma-notification-log.repository.ts:36 — status-dependent field derivation `sentAt: entry.status === 'sent' ? new Date() : null` in the repository (also app clock, not DB now())
- apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts:100-101 — business filter (status='confirmed' AND booking_mode <> 'inventory') hidden in a raw SQL WHERE clause; DispatchReminderUseCase never re-checks status at send time
- apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts:61 — silent fallback `startUtc: row.start_utc ?? new Date()` (business default for a missing slot) in the reader
- apps/api/src/modules/notification/infrastructure/http/notification.module.ts:62-77 — `event.tenantId ?? ''` and unvalidated payload casts (payloadOf/payoutPayloadOf at :83-108) in module wiring; a missing tenantId silently runs forTenant('')

**Port hiện tại:** Three ports, all record/primitive-based, no aggregate awareness. (1) INotificationLogRepository (notification-log-repository.port.ts): flat NotificationLogRecord with string-union status ('pending'|'sent'|'failed'), primitives + optional payload map; exactly two methods — alreadySent(dedupeKey): Promise<boolean> and record(entry): Promise<void>. Append-only: no load/rehydrate, no applyTransition-style state-machine method, no update; each attempt inserts a fresh row. Notably it does NOT take a PrismaTx — the adapter uses prisma.admin (BYPASSRLS pool) internally, outside any forTenant tx, by design (nullable tenant_id, RLS policy lacks WITH CHECK for app_user). (2) INotificationReader (notification-reader.port.ts): pure projection port; tenant-scoped methods take PrismaTx and return fat read-context records (BookingNotificationContext with bigint finalAmount, Date startUtc, resolved NotificationRecipient lists), plus one cross-tenant admin-pool query findUpcomingConfirmed(from,to) returning {tenantId,bookingId} pairs. (3) IEmailSender: technical transport port, primitive EmailMessage. No domain types cross any port; dedupeKey is a caller-built string. A rich-aggregate refactor would add insertPending/markOutcome (or a create-with-unique-key + conditional-update pair) keyed on a real dedupe_key column instead of payload JSON.

**Outbox:** produces: (none) · consumes: booking.created, booking.approved, booking.confirmed, booking.cancelled, booking.completed, booking.no_show, booking.rejected, listing.published, listing.hidden, partner.approved, payout.paid

**Rủi ro refactor:**
- Dedupe-key format is the idempotency identity persisted in historical rows (payload->>'dedupeKey'): any refactor that changes the key shape makes every past 'sent' row invisible to alreadySent, so pending/retrying outbox events re-send old emails. Key format must be byte-for-byte preserved or rows backfilled.
- No unique DB constraint on the dedupe key (migration 20260709000000:660-673 has only PK + tenant/user indexes) — idempotency is a racy read-then-insert (deliver-notification.ts:37 → record). Adding a real dedupe_key column + unique index is the right fix but requires a hand-written migration, RLS re-check (check:rls), and a decision on duplicate historical rows.
- alreadySent does an unindexed JSON-path scan of notification_logs on EVERY outbox delivery and reminder sweep (prisma-notification-log.repository.ts:19-23) — moving this into an aggregate load without adding the index makes a growing-table seq scan the hot path.
- notification_logs writes intentionally bypass RLS via prisma.admin (tenant_id nullable; policy has no WITH CHECK for app_user — migrations/20260709000001:72-77). If the refactor 'normalizes' the repo to take the forTenant tx like other modules, inserts will start failing under RLS.
- Log writes are deliberately OUTSIDE the business transaction (email send is not transactional). Wrapping markSent in a tx that can roll back after the SMTP send loses the 'sent' record → duplicate emails on retry. The aggregate's persistence must stay non-transactional per attempt.
- Failure-policy split is load-bearing: outbox dispatchers record 'failed' then RETHROW so the relay retries (deliver-notification.ts:70); OTP records and SWALLOWS (send-booking-otp.use-case.ts:69-83) because it runs synchronously in the guest request path. A unified no-throw boolean transition must not flip either behavior (no-throw everywhere silently kills relay retries; throw everywhere 500s the OTP endpoint).
- App-clock usage vs the project 'DB clock' rule: sentAt uses new Date() (prisma-notification-log.repository.ts:36) and the T−24h reminder window uses utcNow() app time (reminder.worker.ts:46-48). Silent clock changes shift the reminder band and dedupe semantics of overlapping sweeps.
- bigint serialization boundary: outbox payloads carry amounts as strings (refundAmount BigInt-parsed at booking-notification-data.ts:37, payout amount at dispatch-payout-event.use-case.ts:47) while the reader returns bigint finalAmount. The aggregate/state types must keep string-at-outbox-boundary, bigint-in-domain — JSON.stringify on a bigint state would throw inside the relay handler.
- Cross-module export surface: NotificationModule exports SendBookingOtpUseCase + EMAIL_SENDER, directly imported by booking/application/use-cases/request-booking-otp.use-case.ts:3,16 — renaming or folding the OTP use-case into an aggregate flow breaks the booking module (this is a sanctioned direct import; do not reroute via outbox because the plaintext OTP must never be persisted).
- Handler wiring passes event.tenantId ?? '' and blind-cast payloads (notification.module.ts:62-108); today malformed events no-op or fail-and-retry silently — adding aggregate-level validation that throws will park such events in permanent relay retry (there is no dead-letter queue).
- ReminderWorker runs a BullMQ scheduler per API instance (reminder.worker.ts:31-37); multi-instance deploys already rely solely on the racy dedupe check for at-most-once. Any latency added between alreadySent and record widens the double-send window.
- No GiST/ledger/webhook/RLS-policy coupling beyond the above: the module is a pure consumer with zero HTTP endpoints and zero outbox production, so API-surface blast radius is nil.

### favorites — effort S (7 use-cases, 7 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/favorites/domain/ports/favorite-repository.port.ts — repository port symbol + IFavoriteRepository interface plus five fat READ projection record types (FavoriteCardRecord mirroring PublicListingResponse, CustomerFavoritePage, FavoriteEntryRecord, FavoriteListPage, FavoriteSummaryRecord/FavoriteSummaryTargetRecord); zero domain logic
- apps/api/src/modules/favorites/domain/ports/favorite-tenant-reader.port.ts — IFavoriteTenantReader port: Host header -> tenantId resolution for the storefront (6 lines); zero domain logic
- NOTE: there is NO domain/entities/ directory in this module at all — domain/ contains only the two port files

**Aggregate sau refactor:**
- **Favorite** — A customer's heart on exactly one storefront target (published listing XOR listing group) within a tenant, denormalizing the target's owning partnerId for dashboard scoping. State: id, tenantId, customerId, partnerId, target {kind: listing|group, targetId}, createdAt (DB clock). Both transitions (add, remove) are idempotent no-ops on repeat — a natural fit for the boolean-returning no-throw style. No status field, no lifecycle beyond exists/deleted.
  - Invariants:
    - Exactly one target: listingId XOR groupId (never both, never neither)
    - One heart per (customerId, target) — a duplicate add is a silent no-op, not an error
    - Only an existing AND published listing/group can be favorited
    - partnerId must equal the owning partnerId of the favorited target (denormalized at creation)
    - The favorite belongs to the tenant resolved from a verified storefront domain of an active tenant (RLS-scoped)
    - Removing a non-existent heart is a no-op (idempotent remove)
    - createdAt is the DB clock, not app clock
  - Đang enforce tại:
    - XOR target: DB CHECK favorites_one_target_check — apps/api/prisma/migrations/20260720130000_favorites/migration.sql:11; repo write-mapping ternaries — apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite.repository.ts:175-176; input shape — packages/contracts/src/contracts/favorite.ts:9-13 (single target discriminant, XOR not otherwise expressible)
    - One heart per (customer,target): partial unique indexes — migration.sql:20-21; P2002 swallow in repo add() — prisma-favorite.repository.ts:179-183 (NOT in schema.prisma:1227-1248 — no @@unique there, SQL-only)
    - Published-target-only: repo where-clause status:'published' — prisma-favorite.repository.ts:148-159 (rule stated in comment :146-147); consumed as a null-check throw in use-case — apps/api/src/modules/favorites/application/use-cases/add-favorite.use-case.ts:35-40
    - partnerId denormalization: resolveTargetPartnerId + pass-through orchestration — add-favorite.use-case.ts:34-41; never re-validated anywhere afterwards (nowhere on remove/reads)
    - Tenant scoping: verified-domain + active-tenant where-clause — apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite-tenant.reader.ts:12-15 (on prisma.admin, BYPASSRLS); RLS FORCE + tenant_isolation policy — migration.sql:29-33; forTenant tx in every use-case (e.g. add-favorite.use-case.ts:33)
    - Idempotent remove: deleteMany — prisma-favorite.repository.ts:186-188
    - DB-clock createdAt: DEFAULT CURRENT_TIMESTAMP — migration.sql:8 / schema.prisma:1234

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite.repository.ts:146-159 — the business rule 'only published targets can be favorited' lives as a hidden where-clause (status:'published') inside the repository, documented only by a comment; belongs in Favorite.create() taking a target-state snapshot
- apps/api/src/modules/favorites/application/use-cases/add-favorite.use-case.ts:35-40 — target-existence/publishability invariant enforced as a use-case null-check + NotFoundException on the repo result, split across two layers from the where-clause above
- apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite.repository.ts:169-183 — the 'duplicate heart is a no-op' idempotency rule implemented as a P2002 catch in the repo; the domain never expresses it (aggregate boolean-return add would, with the constraint kept as race backstop)
- apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite.repository.ts:175-176 — the XOR target state-shaping (listingId vs groupId ternaries) is aggregate state-construction logic living in the repository
- apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite.repository.ts:20-41 — toVnd + priceFromModeConfig: bigint VND 'lowest base price' computation copy-pasted from the catalog module (near-identical toVnd/priceFrom in apps/api/src/modules/catalog/application/catalog.mapper.ts:65-95) and re-implemented inside a repository; also group price aggregation at :114-120 — computed money amounts in infra, duplicated cross-module
- apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite-tenant.reader.ts:13-14 — 'favorites only via a verified domain of an active tenant' business rule as an adapter where-clause (verifiedAt not null, tenant.status active), invisible to the domain
- apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite.repository.ts:287-298 — target-kind derivation (isListing branching + null-coalescing casts) in the repo read projection; mild, read-side only

**Port hiện tại:** Single IFavoriteRepository port (favorite-repository.port.ts:66-95): every method takes PrismaTx as first arg (forTenant-compatible). Write methods take loose primitives — add(tx, tenantId, customerId, partnerId, target) and remove(tx, customerId, target) — no aggregate/write-record is passed, no save(favorite), no applyTransition-style method; idempotency semantics are only documented in JSDoc comments (:69, :77). Target uses the @booking/contracts FavoriteTarget type directly (contracts leak into domain ports). Read methods return fat read-projection records declared IN the port file (FavoriteCardRecord deliberately mirrors PublicListingResponse) and reuse contract query types (PartnerFavoritesQuery/TenantFavoritesQuery) verbatim, with dashboard scoping via an optional partnerId?: string parameter. A second port, IFavoriteTenantReader (host -> tenantId), runs pre-tx on the admin pool. resolveTargetPartnerId doubles as existence+published validation, returning string | null.

**Outbox:** produces: (none) · consumes: (none)

**Rủi ro refactor:**
- Race safety of duplicate adds comes ONLY from the partial unique indexes + P2002 swallow (prisma-favorite.repository.ts:179-183). A rich-aggregate rewrite that pre-checks isFavorited() in the domain and drops the catch reintroduces a TOCTOU race — the DB-constraint backstop must survive; the aggregate's no-throw boolean add is a semantic layer on top, not a replacement
- The partial unique indexes and the favorites_one_target_check CHECK exist ONLY in the hand-written SQL migration (migration.sql:11,20-21) — schema.prisma:1227-1248 has no @@unique and cannot express them. Any schema-derived tooling or a rewritten repo mapping (the :175-176 ternaries) can silently violate/bypass them
- createdAt is DB-clock (DEFAULT CURRENT_TIMESTAMP, migration.sql:8). A Favorite.create() factory must not stamp Date.now() — write-state should leave createdAt to the DB or ordering vs other DB-clock features (outbox relay, dashboards) skews
- Host->tenant resolution runs on prisma.admin (BYPASSRLS) BEFORE forTenant (prisma-favorite-tenant.reader.ts:12) and is security-sensitive (x-forwarded-host trust + verified-domain + active-tenant checks). It must stay outside the aggregate and outside the tx; folding it into forTenant is impossible (no tenant id yet) and weakening the where-clause opens cross-tenant hearting
- resolveTargetPartnerId runs INSIDE the tenant tx under RLS (add-favorite.use-case.ts:33-34) — moving target validation pre-tx onto the admin pool would leak cross-tenant listing existence and break the current isolation guarantee
- priceFrom crosses the boundary as a bigint-VND digit STRING (FavoriteCardRecord.priceFrom: string | null). Moving the toVnd/priceFromModeConfig computation into shared domain code must keep string serialization — bigint cannot pass through JSON responses
- Module produces/consumes no outbox events today. If the refactor adds favorite.added/favorite.removed transitions per the outbox style, the swallowed-duplicate add and no-op remove paths must NOT emit (double-emit on retries), and any new consumers must be idempotent
- FavoriteCardRecord intentionally mirrors PublicListingResponse from catalog; pulling that projection into the aggregate would couple favorites to catalog internals — it must remain a read projection outside the aggregate (per plan), and the duplicated toVnd/priceFrom logic should be unified without importing across module boundaries (shared/ or contracts helper)
- remove() never checks partnerId/tenant beyond RLS; if a rehydrate(state) starts asserting partnerId-matches-current-target-owner, historical rows created before a listing ownership change would fail rehydration — the denormalized partnerId is a creation-time snapshot, not a live invariant

### promotions — effort M (20 use-cases, 16 endpoints)

**domain/ hiện tại:**
- domain/promotion-discount.ts — pure eval core: PromotionSpec read shape, computeDiscount, scopeMatches, timeWindowMatches, checkApplicability, evaluatePromo, selectBestAutoCampaign, PromoRejection codes (already framework-free)
- domain/promotion-application.ts — transport shapes for the booking handshake: PromotionSnapshot (immutable, bigint→string), PreparedPromotion, PreparePromotionParams, normalizeCode(), snapshotOf()
- domain/tenant-share-risk.ts — pure evaluateTenantShareRisk() §12.4 ok/warn/block verdict math on commission rates
- domain/ports/promotion-repository.port.ts — IPromotionRepository + fat PromotionRecord (extends PromotionSpec) + CreatePromotionData/UpdatePromotionData property bags + transition methods end/setPartnerOptIn/claimUsage/releaseUsage
- domain/ports/promo-redemption-repository.port.ts — IPromoRedemptionRepository: reserve/markApplied(boolean)/release(string|null)/usageStats/countActiveByCustomer
- domain/ports/promo-context-lookup.port.ts — cross-context read port (listing scope+timezone, prior-bookings count, scope-target label validation+display, partner name, categories)

**Aggregate sau refactor:**
- **Promotion** — One promotion program: code/auto-campaign identity, discount config (type/value/maxDiscount, bigint VND), scope (appliesTo+appliesToId), funding (fundedBy, fundingPartnerId, partnerOptInAt gate), limits (total/per-customer/first-booking/minOrder), off-peak timeWindows, schedule (startsAt/endsAt), status draft→active→paused→ended, redeemedCount, createdByPartnerId. The pure eval functions in promotion-discount.ts become its methods; usage claim/release stay conditional-SQL-backed transitions.
  - Invariants:
    - Code is normalized uppercase and unique per tenant
    - An ended promotion cannot be edited; end is idempotent and promotions are never deleted
    - Scope 'all' has null target; any other scope requires a target id that really is an entity of the declared type in this tenant
    - fundedBy=partner must resolve exactly one funding partner from scope (partner/listing/listing_group only)
    - Changing funding partner (or switching to tenant-funded) clears the partnerOptInAt gate; a partner-funded promo cannot apply until opted in
    - A partner-created promotion is always partner-funded, auto-opted-in, and may only target the partner's own inventory
    - A partner may only update/end promotions it created; opt-in only by the funding partner, only once, only on fundedBy=partner
    - A tenant-funded percent discount certain to drive the tenant commission share negative is blocked (warn in approximation band)
    - redeemedCount may never exceed usageLimitTotal and a use can only be claimed while status=active (race-safe); release never drives the counter negative
    - Applicability: active + inside [startsAt,endsAt) + opt-in gate + scope match + minOrder + time windows + first-booking-only + per-customer cap
    - Update tri-state semantics: null clears an optional condition, absent leaves it untouched
  - Đang enforce tại:
    - create-promotion.use-case.ts:36-41 + update-promotion.use-case.ts:101-114 + create-partner-promotion.use-case.ts:30-35 + update-partner-promotion.use-case.ts:72-85 + DB @@unique([tenantId,code]) prisma/schema.prisma:1665
    - update-promotion.use-case.ts:41-43 + update-partner-promotion.use-case.ts:36-38 + end-promotion.use-case.ts:26 (idempotent guard MISSING in end-partner-promotion.use-case.ts)
    - create-promotion.use-case.ts:51-54 + update-promotion.use-case.ts:79-87 + application/assert-scope-target.ts:23-46 + infrastructure/repositories/prisma-promo-context-lookup.ts:63-90
    - application/resolve-funding-partner.ts:12-39 + create-promotion.use-case.ts:56-57 + update-promotion.use-case.ts:88-93
    - update-promotion.use-case.ts:93-97 (opt-in reset) + domain/promotion-discount.ts:170 (PROMO_NOT_OPTED_IN gate)
    - create-partner-promotion.use-case.ts:44-57 + application/assert-partner-owns-scope.ts:13-39
    - update-partner-promotion.use-case.ts:33-35 + end-partner-promotion.use-case.ts:23-25 + opt-in-promotion.use-case.ts:38-43
    - application/assert-tenant-share-risk.ts:21-43 + domain/tenant-share-risk.ts:47-65 (called from create-promotion.use-case.ts:45-49, update-promotion.use-case.ts:48-56)
    - infrastructure/repositories/prisma-promotion.repository.ts:179-187 (claimUsage conditional UPDATE) + :189-195 (releaseUsage floor at 0) — repo SQL only, no domain enforcement
    - domain/promotion-discount.ts:165-187 (checkApplicability — already domain)
    - update-promotion.use-case.ts:58-76 + update-partner-promotion.use-case.ts:40-57 (duplicated merge logic)
- **PromoRedemption** — One claimed use of a promotion, 1:1 with a booking: promotionId, bookingId, customerId, discountAmount (bigint), status reserved→applied→released. Its transitions are outbox-driven (booking.confirmed/expired/rejected/cancelled) and must stay boolean-returning, no-throw, at-least-once idempotent; reserve is composed synchronously inside the booking module's forTenant tx together with Promotion.claimUsage.
  - Invariants:
    - Exactly one redemption per booking
    - reserved→applied only from reserved (redelivery is a no-op)
    - reserved|applied→released flips exactly once and the paired promotion usage decrement runs exactly once
    - Per-customer cap is checked under a (promotionId, customerId) advisory lock in the same tx as the reserve
    - Reserve + Promotion.claimUsage + booking insert commit or roll back atomically (same tx)
    - Only a 100% refund cancellation releases the redemption; partial refunds keep it applied
  - Đang enforce tại:
    - DB unique bookingId prisma/schema.prisma:1676
    - infrastructure/repositories/prisma-promo-redemption.repository.ts:26-32 (markApplied WHERE status='reserved')
    - infrastructure/repositories/prisma-promo-redemption.repository.ts:39-46 + release-promotion.use-case.ts:26-29 (RETURNING promotion_id pairs the decrement)
    - reserve-promotion.use-case.ts:40-46 (pg_advisory_xact_lock + countActiveByCustomer)
    - reserve-promotion.use-case.ts:47-54 + booking/application/use-cases/create-booking.use-case.ts:330,430 + confirm-booking.use-case.ts:70 (in-tx composition)
    - infrastructure/http/promotions.module.ts:95-99 (refundPercent === 100 branch in handler registration)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- create-promotion.use-case.ts:36-41 — inline code-uniqueness conflict check (PROMO_CODE_TAKEN), repeated in 3 other use-cases
- create-promotion.use-case.ts:51 — scope normalization rule (appliesTo='all' → null target) as inline ternary
- create-promotion.use-case.ts:56-57 — funded_by branching to resolve fundingPartnerId inline
- create-promotion.use-case.ts:76-78 — the invariant 'tenant-created ⇒ createdByPartnerId=null, partnerOptInAt=null' exists only as literal field assignments
- update-promotion.use-case.ts:41-43 — 'ended cannot be edited' status check inline
- update-promotion.use-case.ts:58-99 — field-by-field tri-state merge (null=clear / absent=keep) + scope/funding transition rules; opt-in-gate reset rule at :93-97; near-duplicate of update-partner-promotion.use-case.ts:40-70
- update-promotion.use-case.ts:101-114 — code normalize + uniqueness re-check + auto-campaign conversion branching inline
- create-partner-promotion.use-case.ts:44-57 — 'partner promo is always partner-funded and auto-opted-in' rule as literal data assembly (fundedBy:'partner', partnerOptInAt:utcNow())
- update-partner-promotion.use-case.ts:33-38 — ownership (createdByPartnerId) + ended checks inline
- end-promotion.use-case.ts:26 — idempotent-end branching inline; end-partner-promotion.use-case.ts:17-27 lacks the same ended guard (rule-fragment drift)
- opt-in-promotion.use-case.ts:38-43 — fundedBy/fundingPartnerId/already-opted-in business gates inline
- prepare-promotion.use-case.ts:61-76 — 'customer code wins over auto-campaigns' no-stacking policy branching in the use-case (acknowledged in promotion-discount.ts:207-209 comment as living outside domain)
- prepare-promotion.use-case.ts:82-85 — winner's per-customer-limit re-check policy in use-case
- reserve-promotion.use-case.ts:40-46 — per-customer cap comparison + advisory-lock strategy in use-case, duplicating the checkApplicability per-customer rule
- infrastructure/repositories/prisma-promotion.repository.ts:179-187 — claimUsage invariant (status='active' AND redeemed_count < usage_limit_total) lives only in a repo SQL WHERE clause
- infrastructure/repositories/prisma-promotion.repository.ts:189-195 — releaseUsage floor-at-zero rule in repo SQL
- infrastructure/repositories/prisma-promo-redemption.repository.ts:26-32,39-46 — redemption state machine encoded solely as repo SQL WHERE guards
- infrastructure/http/promotions.module.ts:95-99 — 'only refundPercent===100 releases the usage' business rule inline in outbox handler registration
- application/assert-partner-owns-scope.ts:13-39, assert-scope-target.ts:23-46, assert-tenant-share-risk.ts:21-43 — business rules living as application-layer helper functions that throw HTTP exceptions directly

**Port hiện tại:** Record-based, tx-first. IPromotionRepository trades in a fat PromotionRecord read record (extends the domain PromotionSpec with tenantId/name/partner ids/createdAt) and property-bag write records: CreatePromotionData (all 18 fields) and UpdatePromotionData = Partial<CreatePromotionData> — the use-case assembles the diff, the repo persists it verbatim. Values use domain enums + bigint VND + Date (no raw Prisma types leak; timeWindows JSON is parsed in the adapter). A handful of applyTransition-style methods already exist and return outcome instead of throwing: end(), setPartnerOptIn(at), claimUsage()→boolean (conditional UPDATE), releaseUsage(); IPromoRedemptionRepository is almost fully transition-shaped: markApplied(bookingId)→boolean, release(bookingId)→promotionId|null, both idempotent SQL guards. Every method takes PrismaTx as first argument (caller owns forTenant). IPromoContextLookup is a read-only cross-context port. No aggregate save/rehydrate methods anywhere — create/update remain generic property-bag CRUD.

**Outbox:** produces: (none) · consumes: booking.confirmed, booking.expired, booking.rejected, booking.cancelled

**Rủi ro refactor:**
- Race-safe usage claim: the 'redeemed_count < usage_limit_total AND status=active' invariant is enforced ONLY by the conditional UPDATE in prisma-promotion.repository.ts:179-187 (row-lock serialisation). An aggregate that rehydrates, checks in memory, then saves reintroduces the lost-update race — Promotion.claimUsage must stay a conditional-SQL transition the aggregate merely fronts.
- Idempotency of outbox handlers likewise lives in SQL WHERE guards (prisma-promo-redemption.repository.ts:26-32,39-46). The at-least-once relay (no dead-letter) redelivers; rehydrate-then-save transitions must remain conditional or redelivery double-decrements redeemedCount.
- Advisory lock ordering in reserve-promotion.use-case.ts:41-45 (pg_advisory_xact_lock BEFORE countActiveByCustomer, inside the booking tx) is load-bearing for the per-customer cap; moving the check into an aggregate must not reorder it or leave the tx.
- Cross-module in-tx composition: PreparePromotionUseCase and ReservePromotionUseCase are exported and called synchronously inside the booking module's forTenant tx (booking/create-booking.use-case.ts:330,430; confirm-booking.use-case.ts:70) — deliberately NOT outbox (promo claim + booking insert must commit atomically). Signature changes ripple into booking; do not convert to events.
- Clock: applicability uses app clock utcNow() (prepare-promotion.use-case.ts:115, validate-promo.use-case.ts:60, resolve-auto-campaign.use-case.ts:46) while SQL transitions use DB now() only for updated_at. AGENTS.md says outbox time comparisons use the DB clock — an aggregate taking `now` as a parameter must keep the current utcNow() semantics or intentionally migrate, not mix.
- bigint VND serialization: PromotionSnapshot stringifies bigint (promotion-application.ts:44-53) and is stored on the booking row as an immutable snapshot shared with the booking module — changing its shape breaks stored snapshots and the FE contract; aggregate state must hold bigint, never number.
- RLS-dependent validation: scope-target and funding-partner checks are only tenant-safe because they run inside the caller's forTenant tx (prisma-promo-context-lookup.ts:56-62, resolve-funding-partner.ts note) — validation must stay in-tx after the refactor.
- Code uniqueness is check-then-insert under RLS backed by DB unique (tenantId,code) (schema.prisma:1665); the aggregate check cannot replace the constraint and a Prisma P2002 escape would leak a raw Prisma error (forbidden) if the pre-check is dropped.
- Cross-module import already present: OptInPromotionUseCase and promotions.module.ts import the partner module's AGREEMENT_REPOSITORY port + PrismaAgreementRepository (opt-in-promotion.use-case.ts:10-12, promotions.module.ts:6-7,46), violating the modules-never-import-each-other rule; the refactor will touch this file — decide to preserve or port-ify, but agreement_acceptances proof-recording must survive.
- Handler contract: outbox handlers must stay no-throw idempotent; moving the refundPercent===100 rule (promotions.module.ts:95-99) into the aggregate must keep partial-refund deliveries as successful no-ops, or the relay retries forever (no dead-letter).
- Update tri-state semantics (null=clear vs undefined=keep, update-promotion.use-case.ts:62-76) are contract-load-bearing; an aggregate update method must preserve them or dashboards silently lose the ability to clear caps/windows.
- Public storefront paths (validate-promo, auto-campaigns) resolve tenant by Host via the tenancy module use-case and must stay read-only/no-claim; no ledger triggers or GiST constraints are touched by this module, and there are no webhooks.

### affiliate — effort M (22 use-cases, 13 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/affiliate/domain/affiliate-attribution.ts — pure fraud checks: evaluateAttribution(facts) rejects SELF_REFERRAL (same user / normalized email / phone-digits collision) and SELF_DEALING (affiliate is member of listing's partner)
- apps/api/src/modules/affiliate/domain/affiliate-commission-amount.ts — pure computeAffiliateCommission: replays finance's computeCommissionSplit from the frozen commission_snapshot (+additionalCharges, fundedBy) so commission == ledger leg
- apps/api/src/modules/affiliate/domain/affiliate-context.ts — plain AffiliateContext interface {affiliateId, tenantId} for the membership-gated portal (no logic)
- apps/api/src/modules/affiliate/domain/affiliate-rate.ts — pure resolveEffectiveAffiliateRate (priority custom_rate > rule > none) and applyCustomRate (bakes whole-percent override into the commission snapshot)
- apps/api/src/modules/affiliate/domain/referral-code.ts — pure generateReferralCode (R-XXXXXX, injected RNG) + normalizeReferralCode (trim/uppercase)
- apps/api/src/modules/affiliate/domain/ports/affiliate-repository.port.ts — IAffiliateRepository: fat read records (AffiliateRecord, AffiliateWithUser with user+tenant joins), primitive setters, admin cross-tenant lookup
- apps/api/src/modules/affiliate/domain/ports/affiliate-commission-repository.port.ts — IAffiliateCommissionRepository: commission records w/ booking join, upsert/updateForBooking by bookingId, totals aggregation, markConfirmedPaid
- apps/api/src/modules/affiliate/domain/ports/referral-link-repository.port.ts — IReferralLinkRepository: link records w/ listing title, CRUD + click logging + click counters
- apps/api/src/modules/affiliate/domain/ports/commission-rule-reader.port.ts — ICommissionRuleReader: read-only snapshot of the tenant-default commission rule (finance-owned config)

**Aggregate sau refactor:**
- **Affiliate** — The membership aggregate root: tenantId, userId, status (pending|approved|suspended), customRate (whole-percent override, bigint|null), payoutInfo (jsonb). Owns apply/approve/suspend transitions, custom-rate setting, payout-info replacement. Read joins (userName, tenantHostname) stay in projections.
  - Invariants:
    - One membership per (tenant, user); re-apply is idempotent and returns the existing row
    - A new membership always starts status='pending'
    - Applications only accepted while the tenant is 'active'
    - Tenant may only move status to 'approved' or 'suspended' (no transition graph exists today — approve of an already-suspended row is silently accepted)
    - customRate is a whole percent and must satisfy platform% + affiliate% <= tenant% against the tenant-default rule; clearing (null) always allowed
    - payoutInfo may be replaced at ANY status (whole-object replace); everything else earning-related requires status='approved'
    - Only an 'approved' affiliate can be attributed or have clicks tracked
  - Đang enforce tại:
    - DB unique @@unique([tenantId,userId]) apps/api/prisma/schema.prisma:1713 + idempotent branch apps/api/src/modules/affiliate/application/use-cases/apply-affiliate.use-case.ts:61-62
    - hardcoded in repository apps/api/src/modules/affiliate/infrastructure/repositories/prisma-affiliate.repository.ts:64
    - apps/api/src/modules/affiliate/application/use-cases/apply-affiliate.use-case.ts:52-58
    - only by TS parameter type apps/api/src/modules/affiliate/application/use-cases/set-affiliate-status.use-case.ts:22 (existing.status never checked — nowhere)
    - apps/api/src/modules/affiliate/application/use-cases/update-affiliate-rate.use-case.ts:62,69-86 via apps/api/src/modules/finance/domain/commission-rate-guard.ts:39
    - apps/api/src/modules/affiliate/application/use-cases/require-affiliate-membership.use-case.ts:21-34 vs require-approved-affiliate.use-case.ts:20-31 (controller picks which guard, affiliate.controller.ts:98,111) + whole-replace comment prisma-affiliate.repository.ts:118-119
    - apps/api/src/modules/affiliate/application/use-cases/resolve-attribution.use-case.ts:40 and track-referral.use-case.ts:40 (duplicated status check)
- **ReferralLink** — Small aggregate (or Affiliate child): affiliateId, code, target (tenant_home|listing), listingId, clicksCount. Owns creation consistency and ownership; click logging/aggregation stays infrastructural.
  - Invariants:
    - code unique per tenant (R-XXXXXX)
    - target='listing' requires listingId; target='tenant_home' forces listingId=null
    - Only the owning affiliate may delete its link
    - Clicks are only recorded/counted for links of an approved affiliate
  - Đang enforce tại:
    - DB @@unique([tenantId,code]) apps/api/prisma/schema.prisma:1733 + check-then-insert retry loop apps/api/src/modules/affiliate/application/use-cases/create-referral-link.use-case.ts:30-40
    - apps/api/src/modules/affiliate/application/use-cases/create-referral-link.use-case.ts:25-27,37
    - apps/api/src/modules/affiliate/application/use-cases/delete-referral-link.use-case.ts:21-23
    - apps/api/src/modules/affiliate/application/use-cases/track-referral.use-case.ts:36-40
- **AffiliateCommission** — Per-booking commission aggregate keyed by bookingId: affiliateId, amount (bigint VND), status lifecycle pending→confirmed→paid, {pending,confirmed}→reversed, {confirmed,paid}→clawed_back. Transitions are outbox-event-driven and must stay no-throw idempotent — ideal fit for boolean rehydrate+transition methods.
  - Invariants:
    - Exactly one commission per booking (upsert keyed by unique booking_id)
    - booking.confirmed opens 'pending' (amount = split on finalAmount, charges=0); never resurrects a terminal row (reversed/paid/clawed_back) on redelivery
    - booking.completed confirms with recomputed amount incl. additionalCharges; only from pending/confirmed
    - reverse only from pending/confirmed (pre-completion cancel/reject/expire)
    - clawback only from confirmed/paid (post-completion refund)
    - 'paid' reachable only from 'confirmed' via payout.paid (payeeType=affiliate)
    - amount must always equal the finance ledger's affiliate_commission leg (replay of the frozen commission_snapshot incl. baked-in custom rate)
  - Đang enforce tại:
    - DB @unique bookingId apps/api/prisma/schema.prisma:1759 + upsert apps/api/src/modules/affiliate/infrastructure/repositories/prisma-affiliate-commission.repository.ts:93-104
    - apps/api/src/modules/affiliate/application/use-cases/record-pending-commission.use-case.ts:31-32
    - apps/api/src/modules/affiliate/application/use-cases/record-confirmed-commission.use-case.ts:29
    - apps/api/src/modules/affiliate/application/use-cases/reverse-commission.use-case.ts:24
    - apps/api/src/modules/affiliate/application/use-cases/clawback-commission.use-case.ts:24
    - where-clause {status:'confirmed'} apps/api/src/modules/affiliate/infrastructure/repositories/prisma-affiliate-commission.repository.ts:170-175 + payee filter apps/api/src/modules/affiliate/infrastructure/http/affiliate.module.ts:111-115
    - apps/api/src/modules/affiliate/domain/affiliate-commission-amount.ts:28-39 called from record-pending-commission.use-case.ts:33-39 and record-confirmed-commission.use-case.ts:30-36

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/affiliate/application/use-cases/apply-affiliate.use-case.ts:52-58 — tenant.status !== 'active' application-gate inline in the use-case
- apps/api/src/modules/affiliate/application/use-cases/apply-affiliate.use-case.ts:61-62 — idempotent re-apply branching (existing?.id ?? create) is a domain rule expressed as orchestration
- apps/api/src/modules/affiliate/application/use-cases/set-affiliate-status.use-case.ts:29-32 — status set with NO transition validation (existing.status ignored); status→eventType ternary is domain knowledge inline
- apps/api/src/modules/affiliate/application/use-cases/update-affiliate-rate.use-case.ts:62,69-86 — assertWithinTenantShare (tenant-share-floor invariant) as a private use-case method
- apps/api/src/modules/affiliate/application/use-cases/create-referral-link.use-case.ts:25-27 — target/listingId consistency validation inline
- apps/api/src/modules/affiliate/application/use-cases/create-referral-link.use-case.ts:30-40 — code-uniqueness policy as a 5-attempt check-then-insert loop in the use-case (race window; DB unique is the real guard)
- apps/api/src/modules/affiliate/application/use-cases/create-referral-link.use-case.ts:37 — listingId forced null for tenant_home inline
- apps/api/src/modules/affiliate/application/use-cases/delete-referral-link.use-case.ts:21-23 — link-ownership rule inline
- apps/api/src/modules/affiliate/application/use-cases/track-referral.use-case.ts:36-40 — raw tx.referralLink query bypassing the repo port + 'approved' status business check inline
- apps/api/src/modules/affiliate/application/use-cases/resolve-attribution.use-case.ts:36-40 — raw tx query + duplicate of the same 'approved' rule (copy-pasted rule fragment with track-referral)
- apps/api/src/modules/affiliate/application/use-cases/record-pending-commission.use-case.ts:31-32 — terminal-status guard branching in use-case
- apps/api/src/modules/affiliate/application/use-cases/record-confirmed-commission.use-case.ts:29 — allowed-source-status branching in use-case
- apps/api/src/modules/affiliate/application/use-cases/reverse-commission.use-case.ts:24 — transition precondition (pending|confirmed) inline
- apps/api/src/modules/affiliate/application/use-cases/clawback-commission.use-case.ts:24 — transition precondition (confirmed|paid) inline
- apps/api/src/modules/affiliate/application/use-cases/require-approved-affiliate.use-case.ts:20-23 — membership-selection policy (approved filter, first-approved default) in use-case
- apps/api/src/modules/affiliate/application/use-cases/require-affiliate-membership.use-case.ts:23-25 — variant of the same selection policy (near-duplicate)
- apps/api/src/modules/affiliate/application/booking-finance-view.ts:44-45 — fundedBy derivation (discountAmount > 0n ? promo.fundedBy : null) business rule in an application helper
- apps/api/src/modules/affiliate/application/booking-finance-view.ts:58-68 — sumCharges parsing + negative-clamp of additional_charges jsonb (money rule) in application layer
- apps/api/src/modules/affiliate/infrastructure/repositories/prisma-affiliate.repository.ts:64 — initial status 'pending' policy hardcoded in the repository
- apps/api/src/modules/affiliate/infrastructure/repositories/prisma-affiliate-commission.repository.ts:65-68 — paidAt derived from updatedAt when status==='paid' (lifecycle knowledge) in a repo mapper
- apps/api/src/modules/affiliate/infrastructure/repositories/prisma-affiliate-commission.repository.ts:162-165 — 'a booking counts while its commission is live' rule inside a repo aggregation
- apps/api/src/modules/affiliate/infrastructure/repositories/prisma-affiliate-commission.repository.ts:170-175 — markConfirmedPaid transition guard expressed as an updateMany where-clause

**Port hiện tại:** Record-type CRUD ports, all methods take PrismaTx as first arg (correct per house rules). Reads return FAT records: AffiliateWithUser (base row + userName/userEmail/userPhone/tenantName/tenantHostname joins), AffiliateCommissionWithBooking (+bookingCode/bookingStatus/bookingTotal/listingTitle/derived paidAt), ReferralLinkRecord (+listingTitle) — read projections and write state are the same shape. Writes are primitive field-setters with no preconditions: setStatus(id,status), setCustomRate(id,bigint|null), setPayoutInfo(id,object), and for commissions upsert({affiliateId,bookingId,amount,status}) / updateForBooking(bookingId,{status,amount?}) accept ANY status value — every transition guard lives in the calling use-case, except markConfirmedPaid whose guard is its where-clause. No applyTransition/save(aggregate)/rehydrate methods exist. Money/rates are bigint (good). One BYPASSRLS method (adminFindMembershipsByUser) and one read-only cross-context port (ICommissionRuleReader into finance config). Two use-cases (track-referral, resolve-attribution) bypass the ports entirely with raw tx queries.

**Outbox:** produces: affiliate.applied (apply-affiliate.use-case.ts:87), affiliate.approved (set-affiliate-status.use-case.ts:32), affiliate.suspended (set-affiliate-status.use-case.ts:32), affiliate.payout_updated (update-affiliate-payout-info.use-case.ts:50) · consumes: booking.confirmed → RecordPendingCommission (affiliate.module.ts:93), booking.completed → RecordConfirmedCommission (affiliate.module.ts:96), booking.cancelled → ReverseCommission (affiliate.module.ts:99), booking.rejected → ReverseCommission (affiliate.module.ts:102), booking.expired → ReverseCommission (affiliate.module.ts:105), booking.refunded → ClawbackCommission (affiliate.module.ts:108), payout.paid (payeeType=affiliate) → MarkCommissionsPaid (affiliate.module.ts:111-115)

**Rủi ro refactor:**
- Outbox handlers are at-least-once with NO dead-letter (relay retries forever) — the commission aggregate's transition methods MUST stay no-throw idempotent booleans; a thrown InvalidTransition on redelivery would wedge the event in exponential backoff (guards today: record-*/reverse/clawback use-cases + affiliate.module.ts:92-116)
- Cross-module coupling: ResolveAttributionUseCase is exported (affiliate.module.ts:72) and composed inside the BOOKING module's forTenant tx taking a raw PrismaTx (booking/application/use-cases/create-booking.use-case.ts:363-371); applyCustomRate is plain-imported there too (create-booking.use-case.ts:26,371) — signature/file moves ripple into the booking module
- Ledger parity: commission amount must remain an exact replay of finance's computeCommissionSplit over the frozen commission_snapshot (affiliate-commission-amount.ts) — moving the math into an aggregate that drifts from the finance leg unbalances the affiliate payable vs the double-entry ledger
- markConfirmedPaid is a set-based updateMany with the guard in its where-clause (prisma-affiliate-commission.repository.ts:170-175) — naive load-each-aggregate-mutate-save changes concurrency semantics and cost; keep a set-based port method or accept the N-row loop consciously
- BYPASSRLS path: adminFindMembershipsByUser (prisma-affiliate.repository.ts:129-138) is the one cross-tenant read, strictly userId-filtered; aggregates rehydrated from it must never be writable outside a forTenant scope or RLS is silently bypassed
- paidAt has no column — derived from updatedAt when status==='paid' (prisma-affiliate-commission.repository.ts:65-68); any refactor that rewrites paid rows (e.g. aggregate save touching unchanged rows, @updatedAt bump) corrupts the reported settlement instant
- Uniqueness cannot live in the aggregate: (tenant_id,user_id), (tenant_id,code), booking_id unique are DB constraints; the referral-code retry loop (create-referral-link.use-case.ts:30-40) is check-then-insert and already racy — the refactor should catch P2002 instead, not move uniqueness 'into' the entity
- bigint VND everywhere: customRate/amount are bigint in state, digit-strings on the wire (BigInt(customRateInput) at update-affiliate-rate.use-case.ts:53, .toString() in affiliate.mapper.ts) — aggregate write-state interfaces must keep bigint and never let JSON.stringify meet a bigint
- payoutInfo is legacy untyped jsonb parsed leniently on read (affiliate.mapper.ts:43-46); a strict write-state type on the aggregate must not reject/mangle legacy rows on rehydrate
- Hot public path: track-referral runs per storefront click with a raw one-shot query + click insert (track-referral.use-case.ts:35-50); forcing a full aggregate load here adds latency for a counter bump — keep it a thin projection-based flow
- Event payload trust: handlers pass event.tenantId ?? '' into forTenant (affiliate.module.ts:94-115) — an event missing tenantId would open a wrongly-scoped tx; a refactor touching handler wiring should tighten this rather than copy it
- No DB-clock usage, no GiST reliance, no webhook endpoints in this module (webhooks live in payments); RLS migrations for all 4 tables exist in 20260709000001_rls_domain_and_constraints — keep tenant_id on writes so policies keep matching

### identity-access — effort M (15 use-cases, 15 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/identity-access/domain/login-lockout.ts — pure lockout policy: MAX_FAILED_LOGINS=5, LOCKOUT_MINUTES=15, LockoutState record, isLocked/recordFailure/recordSuccess pure functions (the only real domain logic in the module)
- apps/api/src/modules/identity-access/domain/permission-catalog.ts — static PERMISSION_CATALOG (~50 scope.resource.action keys across platform/tenant/partner) + SYSTEM_ROLES (7 pre-seeded roles); seeded from code, value-object/reference data, not an entity
- apps/api/src/modules/identity-access/domain/ports/user-repository.port.ts — USER_REPOSITORY token; fat UserRecord read record (incl. passwordHash, lockout columns); CRUD-ish methods findByEmail/create/createGuest/setPassword/updateLockout
- apps/api/src/modules/identity-access/domain/ports/session-store.port.ts — SESSION_STORE token; SessionTokens/SessionPrincipal records; create/findByAccessToken/rotate/revoke/revokeAllForUser
- apps/api/src/modules/identity-access/domain/ports/auth-challenge-store.port.ts — AUTH_CHALLENGE_STORE token; OTP challenge lifecycle port with discriminated-union results (ResendChallengeResult, VerifyChallengeResult); issue/resend/verify/consumeCompletion
- apps/api/src/modules/identity-access/domain/ports/auth-email-sender.port.ts — AUTH_EMAIL_SENDER token; sendOtp capability port
- apps/api/src/modules/identity-access/domain/ports/password-hasher.port.ts — PASSWORD_HASHER token; hash/verify capability port
- apps/api/src/modules/identity-access/domain/ports/permission-resolver.port.ts — PERMISSION_RESOLVER token; resolve(userId, scope)→Set<string> + invalidate(userId); consumed cross-module by partner
- apps/api/src/modules/identity-access/domain/ports/session-info-reader.port.ts — SESSION_INFO_READER token; listMemberships(userId)→ScopeMembership[] read-projection port (dashboard shell gating)

**Aggregate sau refactor:**
- **UserAccount** — Owns identity state: email (citext-unique), nullable passwordHash (null = guest-checkout user), fullName/phone/locale, status (active|suspended), emailVerifiedAt, and the lockout sub-state (failedLoginCount, lockedUntil). Transitions: register, createGuest, upgradeGuestToAccount, recordLoginFailure/Success, resetPassword, suspend. Absorbs domain/login-lockout.ts as methods.
  - Invariants:
    - Email is globally unique (guest or full account)
    - A locked account (lockedUntil > now) cannot password-login
    - A suspended account cannot login and its sessions are treated as invalid
    - A guest (passwordHash null) can never password-login
    - 5th consecutive failed login locks the account for 15 minutes and resets the counter; success resets lockout
    - A guest identity may be reused for checkout, but an email owning a password account is never silently attached to a guest booking
    - Guest upgrade sets a password only on an existing passwordless user; it refuses an email that already owns a password account
    - Password reset applies only to real password accounts (silent no-op otherwise, anti-enumeration) and revokes every session on completion
    - Guests are created with locale 'vi' and no password
  - Đang enforce tại:
    - apps/api/prisma/schema.prisma:487 (email @unique @db.Citext — the real uniqueness guard) + TOCTOU pre-checks at application/use-cases/register.use-case.ts:27-34, start-registration.use-case.ts:23-29, complete-registration.use-case.ts:22-28
    - application/use-cases/login.use-case.ts:39-45 + domain/login-lockout.ts:13-15 (isLocked)
    - application/use-cases/login.use-case.ts:46-52 (login) and infrastructure/http/guards/session-auth.guard.ts:32,46 (per-request status==='active')
    - application/use-cases/login.use-case.ts:54-56
    - domain/login-lockout.ts:18-32 (pure fns) applied at application/use-cases/login.use-case.ts:59,62 via infrastructure/repositories/prisma-user.repository.ts:43-48
    - application/use-cases/find-or-create-guest.use-case.ts:21-30
    - application/use-cases/upgrade-guest.use-case.ts:34-48
    - application/use-cases/start-password-reset.use-case.ts:28-39 (only real accounts get OTP email) + complete-password-reset.use-case.ts:26-29 (silent success without userId; revokeAllForUser)
    - infrastructure/repositories/prisma-user.repository.ts:27-37 (createGuest hardcodes passwordHash:null, locale:'vi')
- **Session** — Owns one device session: userId, access/refresh token hashes, both expiries, revokedAt, ip/userAgent. Transitions: issue, rotate (both tokens replaced atomically on the same row), revoke, revokeAll(user). Today 100% of this policy lives in the infra adapter PrismaSessionStore; the port is already transition-shaped.
  - Invariants:
    - Only SHA-256 hashes of tokens are ever persisted (plaintext exists only in the create/rotate return value)
    - An access token authenticates only if the session is not revoked and accessExpiresAt > now
    - A refresh token rotates only if not revoked and refreshExpiresAt > now; rotation replaces BOTH hashes so a previously-rotated token no longer matches (replay rejection)
    - Access TTL 15 min, refresh TTL 30 days
    - Credential reset revokes all of the user's active sessions
    - Token hashes are globally unique
  - Đang enforce tại:
    - infrastructure/services/prisma-session.store.ts:13,33,35,82,84 (hash-only storage)
    - infrastructure/services/prisma-session.store.ts:55 (findByAccessToken validity check)
    - infrastructure/services/prisma-session.store.ts:73,79-87 (rotate validity + double-token replacement)
    - infrastructure/services/prisma-session.store.ts:10-11 (TTL constants)
    - application/use-cases/complete-password-reset.use-case.ts:29 → prisma-session.store.ts:104-109 (revokeAllForUser)
    - apps/api/prisma/schema.prisma:518,520 (@unique accessTokenHash/refreshTokenHash)
- **AuthChallenge** — Owns one OTP challenge (registration | password_reset): purpose, email, locale, optional fullName/userId, otpHash, attempts, resendAt, TTL; plus the one-shot completion token it converts into. Today the ENTIRE lifecycle policy lives in the Redis adapter (infrastructure), not domain. Its transitions are naturally no-throw result-returning (the port already returns discriminated unions) — the closest fit in the module to the outbox-style boolean-transition pattern.
  - Invariants:
    - Max 5 verify attempts, then the challenge is destroyed (locked)
    - Resend allowed only after a 60s cooldown; resend re-issues a new OTP on the same challengeId
    - OTP expires after 10 min; completion token after 30 min
    - A challenge/completion token is only valid for its own purpose
    - OTP comparison is timing-safe against the stored hash
    - Completion token is single-use (atomically consumed)
    - Verify success atomically deletes the challenge and mints the completion token
  - Đang enforce tại:
    - infrastructure/services/redis-auth-challenge.store.ts:17,103-107 (MAX_ATTEMPTS + lock/delete)
    - infrastructure/services/redis-auth-challenge.store.ts:15,49,69-70 (RESEND_AFTER_SEC cooldown)
    - infrastructure/services/redis-auth-challenge.store.ts:14,16,51,97 (OTP_TTL_SEC / COMPLETION_TTL_SEC)
    - infrastructure/services/redis-auth-challenge.store.ts:68,84,122 (purpose match on resend/verify/consume)
    - infrastructure/services/redis-auth-challenge.store.ts:86-88 (timingSafeEqual)
    - infrastructure/services/redis-auth-challenge.store.ts:119 (GETDEL single-use consumption)
    - infrastructure/services/redis-auth-challenge.store.ts:90-99 (multi del+set atomic verify)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/identity-access/application/use-cases/login.use-case.ts:39-56 — the three can-login gates (locked / suspended / guest-has-no-password) are sequential inline if/throws in the use-case; this is the UserAccount.attemptLogin invariant scattered as orchestration-level branching
- apps/api/src/modules/identity-access/application/use-cases/login.use-case.ts:59,62 — the decision of WHEN to record failure vs success (and persisting via field-setter updateLockout) sits in the use-case; only the counter math is domain
- apps/api/src/modules/identity-access/application/use-cases/register.use-case.ts:27-34 — inline EMAIL_TAKEN existence check (copy 1 of 3 of the uniqueness rule fragment; real guard is the DB unique index)
- apps/api/src/modules/identity-access/application/use-cases/start-registration.use-case.ts:23-29 — EMAIL_TAKEN check copy 2
- apps/api/src/modules/identity-access/application/use-cases/complete-registration.use-case.ts:22-28 — EMAIL_TAKEN check copy 3 (plus line 21: payload?.fullName presence doubling as flow-state validation)
- apps/api/src/modules/identity-access/application/use-cases/find-or-create-guest.use-case.ts:21-30 — 'registered email cannot be guest-attached / prior guest is reused' account-linking rule as inline if/else on passwordHash !== null
- apps/api/src/modules/identity-access/application/use-cases/upgrade-guest.use-case.ts:34-48 — guest-upgrade eligibility rules (must exist, must still be passwordless) as inline branching on the raw record
- apps/api/src/modules/identity-access/application/use-cases/start-password-reset.use-case.ts:28-39 — anti-enumeration business branching (issue challenge always, attach userId + send email only when user?.passwordHash) inline, keyed off the fat record
- apps/api/src/modules/identity-access/application/use-cases/complete-password-reset.use-case.ts:27 — 'silent success when challenge has no userId' anti-enumeration rule inline
- apps/api/src/modules/identity-access/application/use-cases/resend-otp.base.ts:32 — email-send eligibility rule (purpose === 'registration' || payload.userId) duplicating start-password-reset's anti-enumeration logic in the shared base class
- apps/api/src/modules/identity-access/infrastructure/services/redis-auth-challenge.store.ts:14-17,69-70,86-88,103-113 — OTP attempt limit, lockout, cooldown, TTL and timing-safe-compare policy implemented entirely inside the Redis adapter (business policy in infrastructure, untestable without Redis)
- apps/api/src/modules/identity-access/infrastructure/services/prisma-session.store.ts:10-11,55,73 — session TTLs and not-revoked/not-expired validity rules live in the Prisma adapter, not domain
- apps/api/src/modules/identity-access/infrastructure/repositories/prisma-user.repository.ts:33-34 — business defaults for a guest identity (passwordHash:null, locale:'vi') hardcoded in the repository
- apps/api/src/modules/identity-access/infrastructure/http/guards/session-auth.guard.ts:32,46 — principal.status === 'active' account-state rule duplicated in the guard (third place the suspended rule appears, after login.use-case.ts:46 and implicitly the me/session endpoints)
- apps/api/src/modules/identity-access/infrastructure/http/auth.controller.ts:50-62 — response mapping defined inline in the controller file instead of application/<module>.mapper.ts (violates the module's own mapper convention; minor)

**Port hiện tại:** Mixed. IUserRepository (domain/ports/user-repository.port.ts) is classic anemic-CRUD: a fat read record (UserRecord exposes ALL columns incl. passwordHash, failedLoginCount, lockedUntil to every caller), primitive-arg field-setters (setPassword(userId, hash), updateLockout(userId, state)), separate create/createGuest input records; no domain entity crosses it, no applyTransition/compare-and-set, and — unlike every other module — NO tx parameter: implementations run directly on prisma.admin (global data, no forTenant/RLS). ISessionStore and IAuthChallengeStore are already transition/capability-shaped: intent-named methods (create/rotate/revoke, issue/resend/verify/consumeCompletion) returning discriminated-union results ({status:'verified'|'invalid'|'expired'|'locked'} etc.) — structurally the closest existing thing to no-throw aggregate transitions, but their state machines are implemented in the adapters, not domain. IPasswordHasher/IAuthEmailSender are pure capability ports; IPermissionResolver/ISessionInfoReader are read-projection ports (Set<string> / ScopeMembership[]). No port anywhere accepts or returns a rich entity.

**Outbox:** produces: (none) · consumes: (none)

**Rủi ro refactor:**
- Clock source: all lockout and session/OTP expiry comparisons use the app clock (new Date()/Date.now() at login.use-case.ts:38, prisma-session.store.ts:29,55,73,78,100,106, redis-auth-challenge.store.ts:49,69) — project convention elsewhere is DB now(); moving these into aggregates must pin ONE injected clock or lockout windows/TTLs silently shift between app and DB time
- Unlike every other module there is NO forTenant/tx flow here — everything runs on prisma.admin (BYPASSRLS) because users/sessions/roles are global tables with no tenant_id; a refactor that mechanically copies the repository-takes-tx pattern from other modules would break (no tenant context exists at login time, before any scope is resolved)
- Lost-update races exist today and must not be accidentally 'fixed' or worsened: login lockout is read-then-updateLockout with no transaction/row-lock (concurrent bad logins can drop counter increments), and session rotate is read-then-update (two concurrent refreshes: loser gets null → forced logout). An aggregate-with-version/compare-and-set redesign changes observable behavior on the hot auth path
- Email uniqueness is really enforced by the citext unique index (schema.prisma:487); the three use-case pre-checks are TOCTOU. If they move into the aggregate, the Prisma P2002 → 409 EMAIL_TAKEN mapping must still exist at the persistence boundary or a race yields a raw 500
- Cross-module consumers pin the current port/DI surface: booking's create-booking.use-case.ts:18,82 injects FindOrCreateGuestUseCase directly (guest checkout breaks if its signature/throw contract changes), partner's prisma-partner-roles.ts:6 uses PERMISSION_RESOLVER (invalidate(userId) single-arg contract), and identity-access.module.ts:67 exports SESSION_STORE — renaming tokens or narrowing UserRecord ripples outside the module
- SessionAuthGuard + PermissionsGuard are global APP_GUARDs registered inside this module (identity-access.module.ts:64-65) and run on EVERY request in the app; any regression in findByAccessToken or resolver behavior is an app-wide outage, and rehydrating a full aggregate per request would add hot-path cost — keep the per-request read as a projection (SessionPrincipal), not an aggregate load
- Redis state-shape compatibility: StoredChallenge JSON (redis-auth-challenge.store.ts:19-23) and the perms:* cache-key format (permission-resolver.service.ts:27) are unversioned; changing the shape mid-deploy invalidates in-flight OTP registrations/password resets and cached permissions
- Token secrecy invariant: plaintext access/refresh tokens and OTPs exist only transiently in the adapters today (hash-only storage); an aggregate that carries plaintext tokens in its state or events would widen the leak surface — hashing must stay a single-point concern
- Anti-enumeration behavior (start/complete password-reset always return success-shaped responses; resend only emails real accounts) is deliberate and subtle — an aggregate that throws on 'no such account' would reintroduce user enumeration
- No outbox today, so no idempotency/relay risk — but if the refactor adds events (e.g. user.registered, user.password_reset) they enter the at-least-once BullMQ relay and every new consumer must be idempotent; conversely nothing currently listens, so adding events is behavior-additive only
- Not applicable here (verified absent): GiST exclusion constraints, ledger triggers, bigint VND money serialization, and gateway webhook paths do not touch this module
- Throttle windows (@Throttle on all 15 endpoints) and cookie semantics (httpOnly sid/rid, cookies.ts) are load-bearing security config in the HTTP layer — keep them untouched by the domain refactor

### partner — effort M (12 use-cases, 13 endpoints)

**domain/ hiện tại:**
- domain/agreement-versions.ts — two string constants: CURRENT_PARTNER_TERMS_VERSION / CURRENT_COMMISSION_SCHEDULE_VERSION recorded at approval
- domain/partner-verification.ts — pure functions: ageInYears, isAdult (under-18 gate), normalizeName, nameMatches (ID vs payout holder), canServeListingType (verified-identity gate for people-booking types)
- domain/ports/partner-repository.port.ts — fat PartnerRecord read record (all JSONB blobs as Record<string,unknown> + joined owner) plus IPartnerRepository CRUD port with generic partial update(), findByIdForUpdate row-lock, addMember/assignRole (writes identity-access tables), countActiveBookings, admin-pool tenantIdOfPartner
- domain/ports/agreement-repository.port.ts — IAgreementRepository with single append-only record() for agreement_acceptances proof rows
- domain/ports/partner-roles.port.ts — IPartnerRoles: partnerOwnerRoleId() lookup + invalidateUserPermissions() cache eviction
- domain/ports/public-partner-repository.port.ts — PublicPartnerRecord read projection (stats, listing types) + findProfile(); no domain/entities/ directory exists today

**Aggregate sau refactor:**
- **Partner** — The single real aggregate root. Owns: identity (name, slug, partnerType, isHouse), status lifecycle (pending -> approved -> suspended; house partners born approved), verification lifecycle (unsubmitted -> pending -> verified | rejected, with verifiedAt), dateOfBirth, identityInfo / payoutInfo / businessInfo / contactInfo JSONB write-state, defaultCancellationPolicyId. Creation invariant also spans first PartnerMember + Partner Owner role assignment (must stay atomic in the same tx). Read projections (owner join, public profile stats) stay outside.
  - Invariants:
    - Slug unique per tenant
    - Approve only from status=pending; idempotent no-op when already approved; any other state rejected
    - Approval atomically records partner_terms + commission_schedule agreement acceptances (version defaulting to current constants)
    - House partner: partnerType forced 'company', isHouse=true, created directly approved, no payout/identity required
    - Suspend blocked while partner has FUTURE confirmed bookings (upper(timeslot|blocked_period) > now())
    - Identity review only when verificationStatus=pending (serialized via SELECT ... FOR UPDATE row lock)
    - Verification requires DOB present; under-18 => rejected with UNDER_18
    - ID document holder name must match payout account holder name (diacritic-insensitive) => else rejected NAME_MISMATCH
    - verified implies verifiedAt set; rejection decision must PERSIST even though the request then fails (commit-then-throw)
    - Applicant becomes first partner member + gets Partner Owner role atomically with partner creation; permission cache evicted after commit
    - Partner may only serve a listing type requiring identity verification when verificationStatus=verified (consumed by listing module)
    - defaultCancellationPolicyId must reference a policy the partner owns or a tenant-shared (partnerId null) policy; null = fall back to tenant default
    - Apply only allowed into an active tenant, within the plan's partner limit
    - documents update merges into businessInfo preserving existing keys (taxId, businessRegistrationNo)
  - Đang enforce tại:
    - slug-unique: application/use-cases/apply-as-partner.use-case.ts:72-78 + create-house-partner.use-case.ts:26-32 (check-then-insert, duplicated) + DB unique index prisma/migrations/20260709000000_full_domain_model/migration.sql:686
    - approve-from-pending + idempotent: application/use-cases/approve-partner.use-case.ts:53-60
    - approval-records-agreements: application/use-cases/approve-partner.use-case.ts:63-79 (version defaulting via domain/agreement-versions.ts:6-7)
    - house-partner shape: application/use-cases/create-house-partner.use-case.ts:37-40 (literals in use-case; nowhere else)
    - suspend-vs-active-bookings: application/use-cases/suspend-partner.use-case.ts:33-40 + SQL rule in infrastructure/repositories/prisma-partner.repository.ts:187-194 (DB now())
    - review-only-pending + row lock: application/use-cases/verify-identity.use-case.ts:49-51 + infrastructure/repositories/prisma-partner.repository.ts:90-99
    - DOB-required + under-18: application/use-cases/verify-identity.use-case.ts:52,56 calling domain/partner-verification.ts:14-16
    - name-match: application/use-cases/verify-identity.use-case.ts:58 calling domain/partner-verification.ts:29-33
    - verified=>verifiedAt: application/use-cases/verify-identity.use-case.ts:79-81 (app clock new Date(); no DB constraint)
    - persist-rejection-then-throw: application/use-cases/verify-identity.use-case.ts:44-47,62-77,96-126
    - member+role atomic: application/use-cases/apply-as-partner.use-case.ts:98-108; cache eviction :121
    - can-serve-listing-type: domain/partner-verification.ts:47-53 via application/assert-can-serve-listing-type.ts:17-28, consumed cross-module at modules/listing/application/use-cases/create-listing.use-case.ts:22,120
    - cancellation-policy ownership: application/use-cases/set-partner-default-cancellation-policy.use-case.ts:32-44 (raw tx.cancellationPolicy query in use-case, bypasses any port; FK only in prisma/migrations/20260717000000_partner_owned_cancellation_policies/migration.sql:31)
    - tenant-active + plan-limit on apply: application/use-cases/apply-as-partner.use-case.ts:52-58,67 (cross-module use-case AssertCanAddPartnerUseCase)
    - businessInfo merge: application/use-cases/update-partner-documents.use-case.ts:44-46
    - submit-identity unconditional -> pending: application/use-cases/submit-identity.use-case.ts:34-42 (NO state gate today — a verified partner can silently reset to pending); payout change after verification never re-triggers name-match: update-payout-info.use-case.ts:33-38 (enforced NOWHERE)
- **AgreementAcceptance** — Append-only proof-of-acceptance record (partner_terms / commission_schedule / promo_funding). Not a true aggregate — no state transitions, insert-only. In the refactor it should stay a plain write record produced by Partner.approve(), not get its own aggregate class.
  - Invariants:
    - Immutable once written (append-only, carries userId/ip/version/acceptedAt for dispute proof)
    - Written only as part of a partner approval (or future promo-funding flows)
  - Đang enforce tại:
    - application/use-cases/approve-partner.use-case.ts:64-79 (only writer)
    - infrastructure/repositories/prisma-agreement.repository.ts:10-21 (create-only repository, no update/delete methods)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- application/use-cases/apply-as-partner.use-case.ts:52-58 — tenant.status !== 'active' business gate branched inline in the use-case
- application/use-cases/apply-as-partner.use-case.ts:72-78 — slug-taken check (check-then-create rule fragment) inline; copy-pasted in create-house-partner
- application/use-cases/apply-as-partner.use-case.ts:84 — initial status 'pending' as a literal in the use-case instead of a creation factory invariant
- application/use-cases/create-house-partner.use-case.ts:26-32 — duplicated slug-taken rule fragment (verbatim copy of apply-as-partner)
- application/use-cases/create-house-partner.use-case.ts:37-40 — house-partner invariants encoded as literals (partnerType:'company', isHouse:true, status:'approved')
- application/use-cases/approve-partner.use-case.ts:53-60 — status state-machine (idempotent-on-approved, pending-only) as if/else in use-case
- application/use-cases/approve-partner.use-case.ts:63-79 — agreement-version defaulting + the both-agreements-on-approve rule composed in the use-case
- application/use-cases/suspend-partner.use-case.ts:33-40 — active-bookings suspension gate inline; no status-transition check at all (suspend from any state, incl. already-suspended, re-emits partner.suspended)
- application/use-cases/submit-identity.use-case.ts:34-42 — unconditional verificationStatus:'pending' transition with no state gate (can reset a verified partner) + DOB string->Date construction
- application/use-cases/verify-identity.use-case.ts:51-60 — full review decision tree (pending gate, missing-DOB, UNDER_18 vs NAME_MISMATCH ordering) computed in the use-case; only the two leaf predicates live in domain
- application/use-cases/verify-identity.use-case.ts:62-76 — rejected-state write + reviewNote-defaults-to-reason rule inline
- application/use-cases/verify-identity.use-case.ts:79-87 — verified-implies-verifiedAt with app-server clock new Date() (project rule says DB clock)
- application/use-cases/update-partner-documents.use-case.ts:44-46 — businessInfo merge-preserving-keys semantics in the use-case
- application/use-cases/update-payout-info.use-case.ts:33-38 — blind overwrite: no rule that changing payout holderName on a verified partner invalidates the name-match (invariant exists nowhere)
- application/use-cases/set-partner-default-cancellation-policy.use-case.ts:32-44 — policy-ownership rule (own OR tenant-shared) expressed as a raw tx.cancellationPolicy.findFirst where-clause directly in the use-case, bypassing the repository port
- application/use-cases/get-public-partner-profile.use-case.ts:10-11,36-39 — anti-disintermediation CONTACT_PATTERN description-scrub business rule in a read use-case
- infrastructure/repositories/prisma-partner.repository.ts:187-194 — 'future confirmed bookings' business rule (status='confirmed' AND upper(COALESCE(timeslot,blocked_period)) > now()) buried in repository raw SQL, reading the booking module's table
- infrastructure/repositories/prisma-public-partner.repository.ts:21-33 — public-visibility rule (approved + at least one published standalone listing or published group with published listing) baked into a repository where-clause

**Port hiện tại:** Record-based, primitives-only, no domain types and no transition methods. IPartnerRepository (domain/ports/partner-repository.port.ts:78-103) returns a FAT read record PartnerRecord (:16-37): every JSONB column typed Record<string,unknown>, plus a joined read-projection field `owner` (earliest PartnerMember's user email/phone) — exactly the fat-read-record shape the refactor wants to replace with a narrow write-state. Writes go through one generic partial-patch update(tx, id, UpdatePartnerData) (:51-62) that can set any mix of status/verificationStatus/verifiedAt/blobs — no applyTransition-style methods, so nothing prevents an invalid transition at the port level. Concurrency is handled by a dedicated findByIdForUpdate (SELECT ... FOR UPDATE, :86). The port also carries cross-boundary operations: addMember/assignRole write partner_members + role_assignments (identity-access tables), countActiveBookings reads the bookings table, and tenantIdOfPartner runs on the admin (BYPASSRLS) pool. All methods take PrismaTx first (repository-takes-tx honored throughout). IAgreementRepository is a single append-only record(). IPublicPartnerRepository is a pure read-projection port. IPartnerRoles is a technical port (role lookup + Redis cache invalidation).

**Outbox:** produces: partner.applied (apply-as-partner.use-case.ts:111), partner.created (create-house-partner.use-case.ts:43), partner.approved (approve-partner.use-case.ts:82), partner.suspended (suspend-partner.use-case.ts:44), partner.identity_submitted (submit-identity.use-case.ts:45), partner.verified (verify-identity.use-case.ts:90), partner.verification_rejected (verify-identity.use-case.ts:73), partner.payout_updated (update-payout-info.use-case.ts:42), partner.documents_updated (update-partner-documents.use-case.ts:51) · consumes: (none)

**Rủi ro refactor:**
- Commit-then-throw in verify-identity (verify-identity.use-case.ts:44-47,62-77): the rejected decision must persist while the HTTP request fails 403. A naive aggregate method that throws inside forTenant would roll back the rejection. The no-throw boolean/result-object transition style actually fits here, but the outcome->HTTP mapping (:96-126, codes NO_PENDING_IDENTITY, MISSING_DOB, UNDER_18, NAME_MISMATCH) must be preserved exactly or the dashboard contract breaks.
- Clock split: verify-identity uses app clock new Date() for both the age check (:56) and verifiedAt (:81), while the suspend gate uses DB now() inside repository SQL (prisma-partner.repository.ts:192). Moving the age check into the aggregate needs `now` passed in; moving the future-bookings predicate into the aggregate would silently switch it from DB clock to app clock — keep it as a repo-supplied count/fact instead.
- Row-lock protocol: findByIdForUpdate (prisma-partner.repository.ts:90-99) is raw SQL SELECT ... FOR UPDATE relied on to serialize concurrent reviews. A rehydrate() path must keep loading through this locked read for review transitions, or two reviewers can both pass the pending gate.
- Slug uniqueness is check-then-insert racing on the DB unique index (partners_tenant_id_slug_key, migration 20260709000000:686). The aggregate cannot own cross-row uniqueness; the P2002 path is currently unhandled (would surface as a raw Prisma error, violating the never-leak-Prisma-errors rule) — refactor should keep the pre-check AND map the constraint violation.
- Generic partial update() writes whole JSONB blobs: if the aggregate is refactored to save full state, concurrent partial writers (payout vs documents vs identity) that today touch disjoint columns would start last-writer-wins clobbering each other's blobs. Either keep column-granular persistence in the repo mapper or add optimistic locking.
- addMember/assignRole write identity-access-owned tables (partner_members, role_assignments) from the partner repository inside the same tx (apply-as-partner.use-case.ts:98-108). This atomicity is required (the applicant must hold Partner Owner at commit) — do NOT 'fix' the module-boundary wrinkle by moving it to an outbox consumer. Post-commit invalidateUserPermissions ordering (:121) must stay after the tx.
- countActiveBookings reads bookings with upper(COALESCE(timeslot, blocked_period)) raw SQL (prisma-partner.repository.ts:187-194) — coupled to the booking module's tstzrange columns (the GiST-constrained ranges). Schema drift there breaks the suspend gate silently.
- tenantIdOfPartner deliberately runs on the admin BYPASSRLS pool (prisma-partner.repository.ts:197-203) because partner-scoped routes have no tenant context; rehydration must keep this two-step (resolve tenant on admin, then load inside forTenant) and never let the aggregate load bypass RLS.
- assertCanServeListingType is imported cross-module by modules/listing/application/use-cases/create-listing.use-case.ts:22 (a sanctioned exception baked into partner.module.ts:66-69 comments + PARTNER_REPOSITORY export). Moving domain/partner-verification.ts into domain/entities/ breaks that import path and the listing module build.
- No outbox consumers exist for any partner.* event today, so payload changes are currently free — but outbox handlers elsewhere assume idempotent redelivery; suspend today re-emits partner.suspended on an already-suspended partner (no state gate), which the boolean-idempotent refactor will change (stop re-emitting) — confirm nothing downstream is added meanwhile that relies on it.
- Approve is idempotent-by-early-return BEFORE recording agreements (approve-partner.use-case.ts:53): a refactored approve() that records agreements on every call would duplicate agreement_acceptances rows (table has no uniqueness on partner+type+version).
- BigInt: countActiveBookings returns bigint from raw SQL, converted via Number() (:194) — keep the conversion at the repo edge; a bigint leaking into an aggregate state snapshot that gets JSON.serialized (outbox payload, response) throws at runtime.
- Plan-limit enforcement is split: apply enforces in-use-case via AssertCanAddPartnerUseCase (apply-as-partner.use-case.ts:67) while house-create uses PlanLimitGuard (tenant-partner.controller.ts:78-79) — an aggregate-centric refactor must not accidentally drop either path.

### catalog — effort M (8 use-cases, 8 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/catalog/domain/attribute-schema.ts — pure validateAttributes(schema, values): AttributeError[] checking listing attribute values against the type's AttributeField[] schema (unknown keys, required, per-type value shape)
- apps/api/src/modules/catalog/domain/ports/hold-reader.port.ts — IHoldReader port + HOLD_READER symbol: batch-read unexpired Redis slot holds by resourceId over a UTC window (read-only, booking module owns the writer)
- apps/api/src/modules/catalog/domain/ports/listing-read-repository.port.ts — IListingReadRepository read port + fat PublicListingRecord projection (64-line record: pricing rules, availability rules/exceptions, group, ratings), BusyRangeRecord, InventoryUsageRecord, PublicListingFilter; all methods take tx
- apps/api/src/modules/catalog/domain/ports/listing-type-repository.port.ts — IListingTypeRepository CRUD port + ListingTypeRecord (fat read record incl. derived listingCount), CreateListingTypeData, UpdateListingTypeData = Partial<CreateListingTypeData>; all methods take tx

**Aggregate sau refactor:**
- **ListingType** — The only write-side aggregate in this module: a tenant-defined listing category owning name/slug/icon, allowedModes/defaultModes, bookingSelection, attributeSchema (drives listing attribute validation), searchConfig (storefront facets/schedule), structure/itemLabel/unitLabel, sortOrder/isActive, requiresIdentityVerification. The public catalog search side is pure read/projection and should NOT become an aggregate. validateAttributes stays a pure domain function but naturally becomes a ListingType method (type.validateAttributes(values)) since the schema is aggregate state.
  - Invariants:
    - slug unique per tenant (race ultimately settled by DB unique index; aggregate can only pre-check via port lookup)
    - defaultModes must be a subset of allowedModes, checked against MERGED state on partial update (zod only fires when both fields are sent)
    - bookingSelection = fixed_packages only permits hourly and daily in allowedModes
    - bookingSelection cannot change while listingCount > 0 (BOOKING_SELECTION_LOCKED)
    - searchConfig consistent with merged allowedModes + attributeSchema: schedule ∈ allowedModes; every attributeFacet references a filterable field; facet control valid for field type; matchAll only for multiselect+checkbox; numeric buckets must not overlap
    - cannot delete a type while any listing references it (LISTING_TYPE_IN_USE; FK RESTRICT is the hard backstop)
    - a listing's attribute values must conform to the type's attributeSchema (cross-module: enforced at listing create/update via the type's schema)
  - Đang enforce tại:
    - slug-unique: apps/api/src/modules/catalog/application/use-cases/create-listing-type.use-case.ts:23-29 + update-listing-type.use-case.ts:40-49 + DB unique index apps/api/prisma/migrations/20260709000000_full_domain_model/migration.sql:701 (listing_types_tenant_id_slug_key)
    - defaultModes-subset: apps/api/src/modules/catalog/application/use-cases/update-listing-type.use-case.ts:52-62 (merged state); create path only via zod refine packages/contracts/src/contracts/listing-type.ts:263-294 — NOT re-checked in create use-case
    - fixed_packages-modes: apps/api/src/modules/catalog/application/use-cases/update-listing-type.use-case.ts:63-72; create path only via zod refine packages/contracts/src/contracts/listing-type.ts:282-288
    - bookingSelection-locked: apps/api/src/modules/catalog/application/use-cases/update-listing-type.use-case.ts:73-83 (uses derived listingCount from the read record)
    - searchConfig-consistency: apps/api/src/modules/catalog/application/listing-type-search-config.validator.ts:36-83, invoked at create-listing-type.use-case.ts:30-34 and update-listing-type.use-case.ts:86-90
    - delete-in-use: apps/api/src/modules/catalog/application/use-cases/delete-listing-type.use-case.ts:28-35 (countListingsOfType) + FK RESTRICT apps/api/prisma/migrations/20260709000000_full_domain_model/migration.sql:968 (listings) and :953 (listing_groups)
    - attributes-conform-to-schema: apps/api/src/modules/catalog/domain/attribute-schema.ts:13-73 wrapped by apps/api/src/modules/catalog/application/assert-valid-attributes.ts:13-26, called from apps/api/src/modules/listing/application/use-cases/create-listing.use-case.ts:93 and update-listing.use-case.ts:179

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/catalog/application/use-cases/create-listing-type.use-case.ts:23-29 — inline slug-taken business check + ConflictException in use-case
- apps/api/src/modules/catalog/application/use-cases/update-listing-type.use-case.ts:40-49 — slug-uniqueness rule copy-pasted from create use-case
- apps/api/src/modules/catalog/application/use-cases/update-listing-type.use-case.ts:52-62 — merged-state defaultModes⊆allowedModes rule inline in use-case, duplicating the zod refine in packages/contracts/src/contracts/listing-type.ts:263-281
- apps/api/src/modules/catalog/application/use-cases/update-listing-type.use-case.ts:63-72 — fixed_packages↔hourly/daily mode restriction duplicated from contract refine (listing-type.ts:282-288)
- apps/api/src/modules/catalog/application/use-cases/update-listing-type.use-case.ts:73-83 — bookingSelection-immutable-while-in-use transition guard (state check on listingCount) inline in use-case
- apps/api/src/modules/catalog/application/use-cases/delete-listing-type.use-case.ts:28-35 — delete-in-use guard inline in use-case
- apps/api/src/modules/catalog/application/listing-type-search-config.validator.ts:36-83 — a core aggregate invariant (searchConfig vs allowedModes/attributeSchema, bucket overlap math) lives in the application layer and throws HTTP BadRequestException directly
- apps/api/src/modules/catalog/infrastructure/repositories/prisma-listing-read.repository.ts:20-29 — publication-visibility business rule (status='published' AND partner approved AND (no group OR group published)) baked into a repo where-clause
- apps/api/src/modules/catalog/infrastructure/repositories/prisma-listing-read.repository.ts:167 and :183-185 — booking-blocking status set ('pending_payment','pending_approval','confirmed') + returned_at semantics hard-coded in raw SQL, a copy of the booking module's status semantics
- apps/api/src/modules/catalog/application/use-cases/search-public-catalog.use-case.ts:354-363 — hourly duration min/max/granularity and lead-time rules re-implemented in the read use-case, duplicating listing/scheduling domain rules (also Date.now() at :363 and :502 vs project DB-clock rule)
- apps/api/src/modules/catalog/application/use-cases/search-public-catalog.use-case.ts:398-402 and :444-448 and :515-519 — buffer-window blocking rule (bufferBefore/bufferAfter around the slot) re-computed in three places in one file
- apps/api/src/modules/catalog/application/catalog.mapper.ts:65-99 — priceFrom/toVnd computed-amount logic (cheapest active package / basePrice across modes, dual string|number parsing) in the mapper; overlapping logic re-implemented again in search-public-catalog.use-case.ts:678-763 (parseModeConfig/configuredPrice/configuredRawPrice)

**Port hiện tại:** Record-typed and CRUD-granular, tx-first. IListingTypeRepository (listing-type-repository.port.ts:55-64): create(tx, tenantId, CreateListingTypeData) / update(tx, id, Partial<CreateListingTypeData>) / delete / findById / findBySlug / list / listActive / countListingsOfType. It returns one fat read record (ListingTypeRecord) that mixes write state with derived read data (listingCount, createdAt/updatedAt) — the same record feeds both invariant checks and HTTP mappers. Data is primitives + contract types (BookingMode[], AttributeField[], ListingTypeSearchConfig parsed via zod in the repo at prisma-listing-type.repository.ts:41); no domain value objects, no aggregate save(), no applyTransition-style guarded update methods (update takes an arbitrary partial patch — any field writable). IListingReadRepository is a pure read-projection port (fat PublicListingRecord + raw-SQL busyRanges/inventoryUsage) and IHoldReader is a technical read port — both fine to keep outside the aggregate.

**Outbox:** produces: listing_type.created (create-listing-type.use-case.ts:51-55), listing_type.updated (update-listing-type.use-case.ts:108-112), listing_type.deleted (delete-listing-type.use-case.ts:37-41) · consumes: (none)

**Rủi ro refactor:**
- Cross-module port coupling: LISTING_TYPE_REPOSITORY is exported (catalog.module.ts:42) and injected by 5 listing-module use-cases (listing/application/use-cases/create-listing.use-case.ts:14-17,55; update-listing.use-case.ts:13-16; create-listing-group.use-case.ts:17-19; get-public-listing-group.use-case.ts:6-8; get-listing-group-detail.use-case.ts:5-7) — reshaping the port around an aggregate (e.g. returning ListingType instead of ListingTypeRecord) breaks the listing module; keep a read-record method or split read/write ports
- assertValidAttributes is plain-imported cross-module (listing/create-listing.use-case.ts:17, update-listing.use-case.ts:16); moving it onto the aggregate changes the listing module's import and error-translation path (INVALID_ATTRIBUTES envelope must stay identical)
- Slug uniqueness is TOCTOU: the use-case pre-check races; the real enforcement is the DB unique index. An aggregate cannot own this invariant — keep the port lookup pre-check AND map Prisma P2002 to 409 LISTING_TYPE_SLUG_TAKEN (conventions forbid leaking Prisma errors)
- Delete-in-use is also TOCTOU: countListingsOfType check races with concurrent listing creation; FK ON DELETE RESTRICT (migration.sql:968) is the backstop — repo delete must translate the FK violation, not crash
- listingCount is derived read data injected into the record; the BOOKING_SELECTION_LOCKED and delete guards depend on it — a narrow write-state interface must still expose an inUse/listingCount input or the aggregate methods need it passed in, or the invariant silently vanishes
- Error-code stability: listing-type-search-config.validator.ts throws HTTP BadRequestException with codes (INVALID_SEARCH_SCHEDULE/INVALID_SEARCH_FACET/INVALID_SEARCH_BUCKETS) the dashboard relies on; moving the rule into a framework-free aggregate requires a domain-error→HttpException translation without changing codes
- Contract/domain duplication: zod refine (contracts/listing-type.ts:263-294) enforces create-time subset/fixed_packages rules; the use-case re-checks only on PATCH merged state. Aggregate must re-check on BOTH paths or the create path regresses if the contract refine is ever relaxed
- DB-clock drift: search-public-catalog.use-case.ts uses Date.now() for hold-window (:107-118 via RedisHoldReader) and lead-time cutoffs (:363, :502) while inventoryUsage SQL uses DB now() (:185) — refactor must not entrench app-clock in the domain layer (project rule: DB clock)
- Raw-SQL reads across module boundary: busyRanges/inventoryUsage query the bookings table directly with a hard-coded blocking-status list and rely on the tstzrange blocked_period && operator (GiST-backed) — a booking-module status/enum change breaks catalog search with no compile error; keep these queries verbatim during refactor
- RedisHoldReader re-declares the booking module's Redis key/member format (holds:{resourceId}, startMs:endMs:holdId, expiry score) with no shared type — any hold-store refactor silently desyncs catalog search
- bigint/VND serialization: prices cross layers as digit strings and bigint (catalog.mapper.ts:65-99, search use-case throughout); introducing money value objects in the aggregate must not let bigint reach JSON.stringify
- RLS: every op already runs inside forTenant with tx-first repos; public search resolves tenant by Host then opens ONE forTenant tx — aggregate refactor must not add extra forTenant calls or per-query txs
- Outbox events listing_type.created/updated/deleted currently have ZERO consumers (repo-wide grep) — payload shape { listingTypeId } is safe to keep; if the aggregate collects domain events, preserve exact eventType strings
- ListPublicListingsUseCase (application/use-cases/list-public-listings.use-case.ts) is registered in catalog.module.ts:36 but injected by no controller — dead code; decide delete vs keep before refactoring it

### tenancy — effort M (29 use-cases, 30 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/tenancy/domain/hostname.ts — pure host helpers: normalizeHostname, buildDefaultSubdomain(slug, baseDomain), domainVerificationRecord (TXT name/value pair)
- apps/api/src/modules/tenancy/domain/plan-limits.ts — pure limit checks: checkHardLimit (allowed while strictly below cap), checkBookingSoftLimit (always allowed, overLimit flag), isModuleEnabled(customDomain|affiliateModule)
- apps/api/src/modules/tenancy/domain/subscription-status.ts — SubscriptionState union, BILLABLE_SUBSCRIPTION_STATUSES const, GRACE_PERIOD_DAYS=30, evaluateSubscription(sub, now) pure fn returning phase/storefrontLive/dashboardWritable/newBookingsAllowed/daysUntilExpiry
- apps/api/src/modules/tenancy/domain/ports/tenant-repository.port.ts — fat TenantRecord read type + CreateTenantData/UpdateTenantData DTOs, CRUD, runInTransaction, isTenantLevelPolicy, countPartners/countListings/countBookingsBetween
- apps/api/src/modules/tenancy/domain/ports/plan-repository.port.ts — PlanRecord (bigint priceMonthly, PlanLimits json), PlanWithSubscribers, CRUD + liveSubscriberCounts(): Map + countSubscriptions
- apps/api/src/modules/tenancy/domain/ports/subscription-repository.port.ts — SubscriptionRecord/AssignSubscriptionData, create (append-only), findCurrentByTenant (latest by startsAt), listByTenant history
- apps/api/src/modules/tenancy/domain/ports/tenant-domain-repository.port.ts — DomainRecord/CreateDomainData, create(tx?), findByHostname/findById(tx?), listByTenant, markVerified, setPrimary(tenantId,id,tx), delete
- apps/api/src/modules/tenancy/domain/ports/tenant-cache.port.ts — Redis host→tenantId cache port with negative caching (undefined=miss, null=negative)
- apps/api/src/modules/tenancy/domain/ports/dns-verifier.port.ts — hasTxtRecord technical port
- apps/api/src/modules/tenancy/domain/ports/domain-verification-queue.port.ts — enqueue(tenantId, domainId) async DNS-check port
- apps/api/src/modules/tenancy/domain/ports/tenancy-config.ts — { baseDomain } config token

**Aggregate sau refactor:**
- **Tenant** — Tenant profile + lifecycle status (active/suspended/expired), settings JSON (partnerPromotionsEnabled flag), themeConfig, defaultCancellationPolicyId. Creation atomically provisions the verified <slug>.<baseDomain> primary domain.
  - Invariants:
    - slug unique platform-wide AND the derived <slug>.<baseDomain> subdomain must be free before create
    - tenant row + its verified primary subdomain are created in one atomic transaction (no orphan tenant)
    - default subdomain is born verified with no verification token (platform owns the base domain)
    - toggling settings.partnerPromotionsEnabled must merge, preserving all other settings keys
    - defaultCancellationPolicyId must reference a tenant-level (partner_id null) policy of this tenant; null clears it
    - status transitions between active/suspended/expired follow no rules (any→any accepted)
    - storefront is live only when status==='active' AND the current subscription evaluates storefrontLive
  - Đang enforce tại:
    - apps/api/src/modules/tenancy/application/use-cases/create-tenant.use-case.ts:32-46 (slug + subdomain pre-checks) + apps/api/prisma/schema.prisma:634 (tenants.slug @unique)
    - apps/api/src/modules/tenancy/application/use-cases/create-tenant.use-case.ts:50-73 (runInTransaction)
    - apps/api/src/modules/tenancy/application/use-cases/create-tenant.use-case.ts:61-71 (verifiedAt: new Date(), token null inline)
    - apps/api/src/modules/tenancy/application/use-cases/set-partner-promotions.use-case.ts:26-28 (spread-merge in use-case)
    - apps/api/src/modules/tenancy/application/use-cases/set-tenant-default-cancellation-policy.use-case.ts:25-31 + apps/api/src/modules/tenancy/infrastructure/repositories/prisma-tenant.repository.ts:102-108
    - NOWHERE — apps/api/src/modules/tenancy/application/use-cases/update-tenant.use-case.ts:34 passes any status through; only the DB enum constrains values
    - apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-host.use-case.ts:66-67 (composed inline per request)
- **TenantDomainPortfolio** — The set of hostnames mapped to one tenant: verification state machine (unverified+token → verified), primary-domain election, deletion protection. Natural child collection of Tenant but operated on independently by worker + tenant self-service.
  - Invariants:
    - hostname globally unique (across all tenants, case-insensitive)
    - adding a custom domain requires the active plan's customDomain feature flag
    - a new custom domain starts unverified with a generated 'bookify-verify=<32hex>' TXT token
    - verification transition: requires a token, sets verifiedAt and clears the token, idempotent under worker retry (already-verified / deleted / reassigned no-ops)
    - only a verified domain may become primary; setting the current primary again is a no-op
    - at most ONE primary domain per tenant (clear-old + set-new must be atomic)
    - the only verified primary domain cannot be deleted (never orphan a live storefront)
    - only verified domains resolve a storefront Host
  - Đang enforce tại:
    - apps/api/src/modules/tenancy/application/use-cases/add-domain.use-case.ts:40-46 + apps/api/prisma/schema.prisma:683 (hostname @unique @db.Citext)
    - apps/api/src/modules/tenancy/application/use-cases/assert-custom-domain-allowed.use-case.ts:15-22, invoked at add-domain.use-case.ts:37
    - apps/api/src/modules/tenancy/application/use-cases/add-domain.use-case.ts:47-53 (token format inline with randomBytes)
    - apps/api/src/modules/tenancy/application/use-cases/verify-domain.use-case.ts:40-47 + apps/api/src/modules/tenancy/infrastructure/domain-verification.worker.ts:77-91 + apps/api/src/modules/tenancy/infrastructure/repositories/prisma-tenant-domain.repository.ts:52-59 (markVerified)
    - apps/api/src/modules/tenancy/application/use-cases/set-primary-domain.use-case.ts:28-36
    - apps/api/src/modules/tenancy/infrastructure/repositories/prisma-tenant-domain.repository.ts:61-72 ONLY (updateMany-then-update inside forTenant tx; no DB partial unique index)
    - apps/api/src/modules/tenancy/application/use-cases/delete-domain.use-case.ts:28-39
    - apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-host.use-case.ts:43
- **SubscriptionPlan** — Platform-level plan catalog: unique name, bigint VND monthly price, PlanLimits json (maxPartners/maxListings/maxBookingsPerMonth/customDomain/affiliateModule), isActive visibility flag.
  - Invariants:
    - name unique (update path pre-checks; create path relies on DB only — a duplicate create leaks a raw Prisma P2002)
    - a price change on a plan with live subscribers requires explicit repriceExistingSubscribers confirmation (subscriptions store no price snapshot)
    - a plan with live subscribers or ANY subscription history cannot be deleted (deactivate instead)
    - priceMonthly is bigint VND, parsed with BigInt, never Number
  - Đang enforce tại:
    - apps/api/src/modules/tenancy/application/use-cases/update-plan.use-case.ts:46-55 + apps/api/prisma/schema.prisma:718 (name @unique); create: NOWHERE in app code (apps/api/src/modules/tenancy/application/use-cases/create-plan.use-case.ts:13-20 has no pre-check)
    - apps/api/src/modules/tenancy/application/use-cases/update-plan.use-case.ts:56-74
    - apps/api/src/modules/tenancy/application/use-cases/delete-plan.use-case.ts:32-60 + apps/api/prisma/schema.prisma:743 (RESTRICT FK, no onDelete)
    - apps/api/src/modules/tenancy/application/use-cases/create-plan.use-case.ts:16 and update-plan.use-case.ts:58
- **TenantSubscription** — Append-only per-tenant subscription stream; 'current' = latest row by startsAt (createdAt tiebreak). Owns period validity and the §6.5 lifecycle evaluation (billable statuses, 30-day grace, storefront/dashboard/booking gates) plus the plan-limit checks derived from the current plan.
  - Invariants:
    - expiresAt must be strictly after startsAt
    - tenant and plan must both exist at assignment (plan FK is RESTRICT)
    - assignment is append-only — a new row supersedes, history is never mutated
    - 'current subscription' = latest by starts_at with created_at tiebreak (one definition, currently triplicated)
    - lifecycle: trial/active/past_due honored until expiresAt; then 30-day grace (storefront suspended, dashboard read-only, no new bookings); suspension keys off the expiry date, not payment status
    - hard caps maxPartners/maxListings block creates when count >= limit; maxBookingsPerMonth is soft and must NEVER block checkout
    - no active plan fails closed (403 NO_ACTIVE_PLAN) for gated features
  - Đang enforce tại:
    - apps/api/src/modules/tenancy/application/use-cases/assign-subscription.use-case.ts:42-50
    - apps/api/src/modules/tenancy/application/use-cases/assign-subscription.use-case.ts:28-41 + apps/api/prisma/schema.prisma:742-743
    - apps/api/src/modules/tenancy/infrastructure/repositories/prisma-subscription.repository.ts:33-46 (create only, no update method on port)
    - apps/api/src/modules/tenancy/infrastructure/repositories/prisma-subscription.repository.ts:48-54 + duplicated in raw SQL at apps/api/src/modules/tenancy/infrastructure/repositories/prisma-plan.repository.ts:96-109 and apps/api/src/modules/tenancy/application/use-cases/get-platform-health.use-case.ts:161-167
    - apps/api/src/modules/tenancy/domain/subscription-status.ts:43-82 (pure domain fn) consumed by apps/api/src/modules/tenancy/infrastructure/http/guards/require-active-subscription.guard.ts:25 and resolve-tenant-by-host.use-case.ts:66
    - apps/api/src/modules/tenancy/domain/plan-limits.ts:18-32 + apps/api/src/modules/tenancy/application/use-cases/assert-can-add-partner.use-case.ts:23-27, assert-can-add-listing.use-case.ts:22-26, check-booking-quota.use-case.ts:20-27
    - apps/api/src/modules/tenancy/application/plan-limit-errors.ts:10-19 (requirePlanLimits)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/tenancy/application/use-cases/create-tenant.use-case.ts:61-71 — 'default subdomain is trusted → born verified, no token' rule expressed as inline literals (verifiedAt: new Date(), verificationToken: null); belongs to a Domain.provisionDefaultSubdomain factory
- apps/api/src/modules/tenancy/application/use-cases/add-domain.use-case.ts:51 — verification-token format `bookify-verify=${randomBytes(16).toString('hex')}` generated inline in the use-case; the TXT contract half lives in domain/hostname.ts:20-25, the token half here
- apps/api/src/modules/tenancy/application/use-cases/verify-domain.use-case.ts:40-47 — domain-state branching (already-verified short-circuit, no-token → DOMAIN_NOT_VERIFIABLE) instead of a domain.canVerify()/requestVerification() decision
- apps/api/src/modules/tenancy/application/use-cases/set-primary-domain.use-case.ts:28-35 — 'must be verified before primary' + idempotent short-circuit checked inline on the record
- apps/api/src/modules/tenancy/application/use-cases/delete-domain.use-case.ts:28-39 — 'never delete the only verified primary' computed by filtering the sibling list in the use-case; a portfolio-aggregate rule
- apps/api/src/modules/tenancy/application/use-cases/assign-subscription.use-case.ts:44-50 — period validity (expiresAt > startsAt) validated inline; belongs to a Subscription.create factory
- apps/api/src/modules/tenancy/application/use-cases/update-plan.use-case.ts:58-74 — repricing detection (BigInt compare vs stored price) + subscriber-gated confirmation branching in the use-case
- apps/api/src/modules/tenancy/application/use-cases/delete-plan.use-case.ts:37-60 — two-tier referenced-plan deletion gates (live vs history) as inline if/throw
- apps/api/src/modules/tenancy/application/use-cases/set-partner-promotions.use-case.ts:26-28 — settings JSON read-merge-write rule in the use-case; a Tenant.togglePartnerPromotions method
- apps/api/src/modules/tenancy/application/use-cases/set-tenant-default-cancellation-policy.use-case.ts:25-31 — 'policy must be tenant-level and owned by this tenant' rule split between use-case and repository predicate (prisma-tenant.repository.ts:102-108)
- apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-host.use-case.ts:43 — 'only a verified domain resolves' business rule inline in cache-miss branch
- apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-host.use-case.ts:67 — liveness composition (tenant.status === 'active' && evaluation.storefrontLive) inline; a Tenant.isLive(evaluation) rule
- apps/api/src/modules/tenancy/infrastructure/domain-verification.worker.ts:79-90 — the verification transition's idempotency guards (deleted/reassigned/already-verified/tokenless) live in an infrastructure worker, exactly the shape of an outbox-style boolean no-throw transition that should be domain.markVerified()
- apps/api/src/modules/tenancy/infrastructure/repositories/prisma-tenant-domain.repository.ts:61-72 — the one-primary-per-tenant invariant exists ONLY as this repository's updateMany-then-update sequence (no DB constraint, no domain object)
- apps/api/src/modules/tenancy/infrastructure/repositories/prisma-tenant-domain.repository.ts:56 — markVerified stamps verifiedAt with the app clock (new Date()) inside the repo; transition semantics (clear token) encoded in infra
- apps/api/src/modules/tenancy/infrastructure/repositories/prisma-plan.repository.ts:96-109 — 'current subscription = DISTINCT ON latest starts_at, billable, unexpired' rule re-implemented in raw SQL (only the status list is derived from the domain constant; the recency+expiry halves are copy-pasted logic)
- apps/api/src/modules/tenancy/application/use-cases/get-platform-health.use-case.ts:161-167 — third copy of the 'current subscription' recency rule in raw SQL
- apps/api/src/modules/tenancy/application/use-cases/get-platform-health.use-case.ts:237 — re-lists ['trial','active','past_due'] as a literal instead of BILLABLE_SUBSCRIPTION_STATUSES for the expiring-within-14-days queue
- apps/api/src/modules/tenancy/application/use-cases/get-platform-health.use-case.ts:21 — GMV_STATUSES ('confirmed','completed','no_show') — a booking-domain rule defined inside a tenancy use-case's raw SQL
- apps/api/src/modules/tenancy/application/use-cases/update-tenant.use-case.ts:34 — status changes pass straight through with zero transition rules (missing invariant: an aggregate would own allowed transitions)

**Port hiện tại:** Classic record-style ports: every method returns a fat read record (TenantRecord, PlanRecord, SubscriptionRecord, DomainRecord — full row incl. createdAt/updatedAt and Json blobs as Record<string,unknown>), with separate Create*/Update* partial DTOs of primitives (string/boolean/Date/bigint; PlanLimits json passthrough). No applyTransition-style methods and no aggregate save() — the closest are two single-purpose state-flip methods: ITenantDomainRepository.markVerified(id) (repo stamps verifiedAt + clears token itself) and setPrimary(tenantId, id, tx) (repo owns the clear-old/set-new invariant), plus ISubscriptionRepository.create being append-only by design. tx is OPTIONAL (tx?) on tenant/domain create + domain findById; everything else hits prisma.admin (BYPASSRLS) directly — this module is almost entirely admin-pool, with only SetPrimaryDomainUseCase using TenantDbService.forTenant (set-primary-domain.use-case.ts:19). Cross-aggregate reads are exposed as count methods (countPartners/countListings/countBookingsBetween, liveSubscriberCounts, countSubscriptions) and a cross-module predicate isTenantLevelPolicy on the tenant repo. ITenantRepository.runInTransaction exposes an admin-pool tx factory to the application layer.

**Outbox:** produces: (none) · consumes: (none)

**Rủi ro refactor:**
- Admin-pool, not forTenant: nearly all tenancy writes run on prisma.admin (BYPASSRLS) with optional tx — only set-primary-domain.use-case.ts:19 uses forTenant. An aggregate-save path must preserve the dual-pool split exactly; RLS is NOT the isolation mechanism here, explicit tenantId filters are (e.g. prisma-subscription.repository.ts:62).
- One-primary-per-tenant has NO DB constraint — it is guaranteed solely by PrismaTenantDomainRepository.setPrimary's two-statement sequence inside one tx (prisma-tenant-domain.repository.ts:61-72). A refactor that persists per-domain isPrimary flags from aggregate state instead of the atomic swap can race and produce two primaries.
- Domain verification runs in a BullMQ worker outside any HTTP request (domain-verification.worker.ts): it must stay idempotent under 5 retries w/ exponential backoff (silent no-ops at :79-81 for deleted/reassigned/verified/tokenless) and must keep throw-to-retry semantics for a not-yet-propagated TXT record (:86-88). This is the natural candidate for a boolean no-throw markVerified() transition — but converting the 'TXT missing' throw into a boolean would break the retry loop.
- Redis host-cache eviction ordering: invalidateHost is called AFTER commit (create-tenant.use-case.ts:74, update-tenant.use-case.ts:35-38, worker :91). Moving it inside a transaction (evict-then-rollback) or dropping a call leaves a suspended/renamed tenant live for the 60s TTL (redis-tenant-cache.ts:6). Negative caching (unknown host = '') must also survive the refactor.
- Two clocks: evaluateSubscription and the guards use the Node clock (require-active-subscription.guard.ts:25, resolve-tenant-by-host.use-case.ts:36, check-booking-quota.use-case.ts:23-24 Date.UTC month window) while liveSubscriberCounts/health SQL use DB now() (prisma-plan.repository.ts:106, get-platform-health.use-case.ts:127-180). Consolidating into an aggregate must pick one clock deliberately — silently switching shifts expiry/grace boundaries and MRR.
- bigint VND end-to-end: PlanRecord.priceMonthly is bigint, MRR is summed with 0n (get-platform-health.use-case.ts:221-231), serialized only at the mapper as digit strings (tenancy.mapper.ts:84-92,151-196). Aggregate state holding bigint must never pass through JSON.stringify or Number() — a rehydrate(state) snapshot type must keep bigint.
- The 'current subscription' rule (latest by starts_at, created_at tiebreak, billable, unexpired) exists in three places: prisma-subscription.repository.ts:48-54, raw SQL prisma-plan.repository.ts:96-109, raw SQL get-platform-health.use-case.ts:161-167. If the aggregate redefines 'current', the two raw-SQL copies silently diverge (wrong MRR, wrong deletion gates).
- Uniqueness races are settled by DB constraints (tenants.slug, tenant_domains.hostname citext, subscription_plans.name); use-case pre-checks are advisory (check-slug-availability.use-case.ts:22-24 says so). Moving pre-checks into aggregates without a P2002→409 translation in repos leaks raw Prisma errors — and CreatePlanUseCase already has this bug today (no name pre-check, no catch).
- Cross-module surface: TenancyModule exports AssertCanAddPartnerUseCase/AssertCanAddListingUseCase, PlanLimitGuard, RequireActiveSubscriptionGuard, TENANT_REPOSITORY, SUBSCRIPTION_REPOSITORY, ResolveTenantByHostUseCase (tenancy.module.ts:114-125) — partner/catalog/booking modules re-instantiate the guards in their own injectors and inject the raw ports. Changing port record shapes or the assert use-case signatures breaks consumers outside this module.
- hostname is citext in Postgres (case-insensitive) but Redis cache keys `host:<hostname>` are case-sensitive strings — correctness depends on normalizeHostname being applied on every path (resolve-tenant-by-host.use-case.ts:37, add-domain.use-case.ts:39). An aggregate that stores raw hostnames breaks cache invalidation.
- No outbox today: tenancy emits and consumes nothing (get-platform-health only SELECTs outbox_events as a health metric). Introducing outbox-event-driven transitions (tenant.suspended, subscription.assigned, domain.verified) is NEW behavior with no existing consumers — safe to add, but do not assume existing events exist.
- Nest route-ordering trap: admin-tenant.controller.ts:124-126 deliberately declares GET config and GET slug-check before GET :id — any controller reshuffle during the refactor must keep declaration order or both routes 400 as malformed uuids.

### listing — effort L (45 use-cases, 56 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/listing/domain/group-stats.ts — pure post/group aggregates: toVnd dual-shape (string|number) VND parser, basePrices extractor from modeConfig, isListingReady, computeGroupStats (listingCount/readyListingCount/priceFrom)
- apps/api/src/modules/listing/domain/moderation/contact-scan.ts — pure anti-disintermediation scanner: VN phone/zalo/email/url regex scan over text fields + photo filename/query scanning (photoScanFields)
- apps/api/src/modules/listing/domain/moderation/listing-moderation.ts — pure publish-status state machine: transitionSubmit/Publish/Hide/Republish over {status, publishedBy, hiddenBy}, admin-lock invariant (assertNotAdminLocked), throws typed ModerationError (NOT no-throw boolean style)
- apps/api/src/modules/listing/domain/moderation/review-checklist.ts — pure submission checklist builder (photos/description/price-per-mode/cancellation-policy) + checklistPassed
- apps/api/src/modules/listing/domain/pricing/package-config.ts — validateAndNormalizeModeConfig (cross-field booking-policy validation + legacy-blocks strip), activePackages/findActivePackage, publicModeConfig read projection
- apps/api/src/modules/listing/domain/pricing/quote-calculator.ts — pure quote engine computeQuote/computeQuoteResponse: rule matching by wall clock, per-unit flexible pricing, fixed-package pricing, inventory pricing, deposit math, all bigint VND
- apps/api/src/modules/listing/domain/ports/listing-repository.port.ts — IListingRepository + fat ListingRecord/PublicListingRecord read records, CreateListingData/UpdateListingData bags, ModerationUpdate, ListingFilter
- apps/api/src/modules/listing/domain/ports/listing-group-repository.port.ts — IListingGroupRepository + ListingGroupRecord (embeds partnerPublic + children facts), CRUD + moderate + countListings
- apps/api/src/modules/listing/domain/ports/cancellation-policy-repository.port.ts — ICancellationPolicyRepository: partner/tenant-level listing, CRUD, countListingsUsing delete-guard query, default-id lookups
- apps/api/src/modules/listing/domain/ports/pricing-rule-repository.port.ts — IPricingRuleRepository: create/findById/listByListing/delete, PricingRuleRecord with VND digit strings
- apps/api/src/modules/listing/domain/ports/resource-repository.port.ts — IResourceRepository: create/findById/list, minimal ResourceRecord (calendar-holder, timezone)
- apps/api/src/modules/listing/domain/ports/commission-coverage-reader.port.ts — ICommissionCoverageReader.findEffectiveRule (deposit-vs-commission gate input)

**Aggregate sau refactor:**
- **Listing** — The bookable item: content (title/slug/photos/description/address), booking config (bookingModes, modeConfig, depositPercent, balanceDue, buffers, capacity/stock), group membership, cancellation-policy choice, and its moderation lifecycle (draft→pending_review→published→archived with publishedBy/hiddenBy/submittedAt/publishedAt). Rehydrate from a narrow write-state (id, partnerId, listingTypeId, resourceId, groupId, slug, status, publishedBy, hiddenBy, submittedAt, publishedAt, bookingModes, bookingSelection, modeConfig, depositPercent, cancellationPolicyId) — NOT the fat ListingRecord.
  - Invariants:
    - bookingModes ⊆ listingType.allowedModes
    - modeConfig valid+normalized for the type's bookingSelection (packages vs flexible, unique package ids, no packages on flexible)
    - depositPercent ≥ effective percent commission unless house partner
    - moderation state machine incl. admin-hide lockout (partner cannot resubmit/republish an admin-hidden listing)
    - group-managed listing cannot be moderated individually (submit/publish/hide/republish must go through the group)
    - a bound group must share partner and listingType, and be in draft to change membership/items
    - attached resource must belong to the same partner
    - slug unique per tenant
    - cannot delete while bookings exist
    - publish blocked while contact info is flagged unless reviewer forces (audited)
    - submittedAt stamped on every entry to pending_review; publishedAt only on FIRST publish (survives hide/republish)
    - partner-scoped calls only touch the partner's own listing
  - Đang enforce tại:
    - apps/api/src/modules/listing/application/use-cases/create-listing.use-case.ts:85-92 (modes⊆allowed)
    - apps/api/src/modules/listing/application/use-cases/update-listing.use-case.ts:182-191 (modes⊆allowed, duplicated)
    - apps/api/src/modules/listing/domain/pricing/package-config.ts:56-176 (modeConfig rules, already pure)
    - apps/api/src/modules/listing/application/use-cases/assert-listing-deposit-coverage.use-case.ts:22-34 (deposit≥commission)
    - apps/api/src/modules/listing/domain/moderation/listing-moderation.ts:34-97 (state machine, already pure)
    - apps/api/src/modules/listing/application/use-cases/moderation/submit-listing.use-case.ts:44-50 + publish-listing.use-case.ts:39-45 + hide-listing.use-case.ts:43-49 + republish-listing.use-case.ts:44-50 (group-managed guard, 4 copies)
    - apps/api/src/modules/listing/application/use-cases/create-listing.use-case.ts:137-167 (group owner/type/draft rules)
    - apps/api/src/modules/listing/application/use-cases/update-listing.use-case.ts:107-161 (same group rules, duplicated)
    - apps/api/src/modules/listing/application/use-cases/delete-listing.use-case.ts:50-67 (group read-only + has-bookings)
    - apps/api/src/modules/listing/application/use-cases/create-listing.use-case.ts:180-188 (resource ownership)
    - apps/api/src/modules/listing/application/use-cases/create-listing.use-case.ts:69-75 + update-listing.use-case.ts:125-134 (slug check) + apps/api/prisma/schema.prisma:988 @@unique([tenantId, slug]) (DB backstop)
    - apps/api/src/modules/listing/application/use-cases/moderation/publish-listing.use-case.ts:47-56 (contact-info gate)
    - apps/api/src/modules/listing/application/moderation/moderation-support.ts:64-74 (timestamp stamping)
    - apps/api/src/modules/listing/application/moderation/moderation-support.ts:37-45 (ownership)
- **ListingGroup (Post)** — The storefront-facing post that owns album/amenities/address content, its own moderation lifecycle, and the cascade rule that its children moderate WITH it. Child stats (listingCount/readyListingCount/priceFrom) are read projections that stay outside.
  - Invariants:
    - same moderation state machine + admin-hide lockout as Listing
    - cannot submit an empty post (must contain ≥1 listing)
    - publish gate scans contact info on the post AND every child (namespaced flags), force override audited
    - every moderation transition cascades to all children in the same tx (submit→children submit, publish→children publish as admin, hide→children hide with escalated actor, republish→children republish)
    - only draft/archived posts are partner-editable; partner edit of an archived post reopens it (and children) to draft
    - group must use a non-standalone listing type
    - slug unique per tenant
    - cannot delete while it still contains listings
    - partner-scoped calls only touch the partner's own post
  - Đang enforce tại:
    - apps/api/src/modules/listing/domain/moderation/listing-moderation.ts:34-97 (shared machine)
    - apps/api/src/modules/listing/application/moderation/run-group-moderation.ts:67-73 (empty-post rule)
    - apps/api/src/modules/listing/application/use-cases/moderation/publish-listing-group.use-case.ts:48-56 + application/moderation/build-listing-group-review.ts:25-42 (child-inclusive contact gate)
    - apps/api/src/modules/listing/application/moderation/run-group-moderation.ts:76-85 (per-action if/else cascade)
    - apps/api/src/modules/listing/application/use-cases/update-listing-group.use-case.ts:67-89 (edit guard + archived→draft reopen cascade)
    - apps/api/src/modules/listing/application/use-cases/create-listing-group.use-case.ts:46-52 (non-standalone type)
    - apps/api/src/modules/listing/application/use-cases/create-listing-group.use-case.ts:53-59 + update-listing-group.use-case.ts:90-99 (slug) + apps/api/prisma/schema.prisma:894 @@unique([tenantId, slug])
    - apps/api/src/modules/listing/application/use-cases/delete-listing-group.use-case.ts:45-52 (non-empty delete guard)
    - apps/api/src/modules/listing/application/moderation/moderation-support.ts:37-45 (ownership)
- **CancellationPolicy** — Named tier-rule set owned either by a partner (partnerId set) or the tenant (partnerId null); referenced by listings and resolved via 3-level fallback (listing → partner default → tenant default) at read time.
  - Invariants:
    - only the owning partner may edit/delete a partner policy; tenant-level policies are read-only to partners
    - tenant-settings endpoints may only edit/delete tenant-owned (partnerId null) policies
    - cannot delete while any listing's own cancellationPolicyId references it
  - Đang enforce tại:
    - apps/api/src/modules/listing/application/use-cases/update-cancellation-policy.use-case.ts:35-41 + delete-cancellation-policy.use-case.ts:27-33 (partner ownership)
    - apps/api/src/modules/listing/application/use-cases/update-tenant-cancellation-policy.use-case.ts:33-39 + delete-tenant-cancellation-policy.use-case.ts:33-39 (tenant-owned guard)
    - apps/api/src/modules/listing/application/use-cases/delete-cancellation-policy.use-case.ts:34-41 + delete-tenant-cancellation-policy.use-case.ts:40-47 (in-use guard, duplicated)
    - fallback chain lives in the REPOSITORY: apps/api/src/modules/listing/infrastructure/repositories/prisma-listing.repository.ts:52-61 (resolveEffectivePolicy)
- **PricingRule (child entity under Listing, or small aggregate keyed by listing)** — Conditional per-unit price override (day_of_week/time_range/date_range/date_time_range) with optional salePrice and priority; only meaningful for flexible-duration listings.
  - Invariants:
    - rule's bookingMode must be enabled on the listing
    - forbidden on fixed_packages listings (package prices live in modeConfig)
    - date_time_range windows on the same date/mode must not overlap
    - saving a calendar override (date_range/date_time_range) with identical params replaces the previous rule (deterministic save)
    - rule must belong to the listing it is deleted through; listing must belong to the calling partner
  - Đang enforce tại:
    - apps/api/src/modules/listing/application/use-cases/create-pricing-rule.use-case.ts:39-52 (mode-enabled + fixed-packages, copy 1)
    - apps/api/src/modules/listing/application/use-cases/create-partner-pricing-rule.use-case.ts:46-58 (same, copy 2)
    - apps/api/src/modules/listing/application/use-cases/create-partner-pricing-rule.use-case.ts:61-84 (overlap check — partner path ONLY, tenant path has no overlap check)
    - apps/api/src/modules/listing/application/use-cases/create-partner-pricing-rule.use-case.ts:85-93 (replace semantics)
    - apps/api/src/modules/listing/application/use-cases/delete-partner-pricing-rule.use-case.ts:27-39 (ownership + rule∈listing)
    - no DB constraint backs overlap or fixed-packages rules — nowhere else
- **Resource (tiny aggregate / entity)** — Calendar-holding unit (name, timezone, partner); several listings may share one so they can never double-book (the GiST exclusion lives in the booking side keyed by resource_id).
  - Invariants:
    - a listing may only attach a resource of its own partner (enforced at Listing, not here)
    - auto-created 1:1 resource inherits tenant timezone
  - Đang enforce tại:
    - apps/api/src/modules/listing/application/use-cases/create-listing.use-case.ts:180-196 (ownership + auto-create)
    - apps/api/src/modules/listing/application/use-cases/create-resource.use-case.ts:23 (timezone default)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/listing/application/use-cases/create-listing.use-case.ts:85-92 — inline bookingModes⊆allowedModes validation with computed invalid list
- apps/api/src/modules/listing/application/use-cases/create-listing.use-case.ts:137-167 — if/else business chain: group must exist, share partner, share listingType, be draft
- apps/api/src/modules/listing/application/use-cases/create-listing.use-case.ts:180-188 — resource-ownership business rule inline
- apps/api/src/modules/listing/application/use-cases/update-listing.use-case.ts:85-105 — business condition deciding when deposit-coverage re-check applies + effective-category computation
- apps/api/src/modules/listing/application/use-cases/update-listing.use-case.ts:107-161 — copy-paste of create's group-binding rules (owner/type/read-only) with drift risk
- apps/api/src/modules/listing/application/use-cases/update-listing.use-case.ts:181-191 — copy-paste of the mode-validation fragment from create
- apps/api/src/modules/listing/application/use-cases/update-listing.use-case.ts:56-63 and update-listing-group.use-case.ts:39-46 — 'both provinceCode and wardCode or neither' rule duplicated in two use-cases
- apps/api/src/modules/listing/application/use-cases/delete-listing.use-case.ts:50-67 — group-read-only + has-bookings delete guards inline
- apps/api/src/modules/listing/application/use-cases/assert-listing-deposit-coverage.use-case.ts:24 — the deposit≥commission comparison (BigInt(depositPercent) >= rule.rate incl. isHouse exemption) is domain math living in a use-case
- apps/api/src/modules/listing/application/use-cases/create-pricing-rule.use-case.ts:39-52 and create-partner-pricing-rule.use-case.ts:46-58 — mode-enabled + fixed-packages branching duplicated across tenant/partner variants; tenant variant lacks the overlap check the partner variant has
- apps/api/src/modules/listing/application/use-cases/create-partner-pricing-rule.use-case.ts:61-93 — overlap detection via JSON.stringify param comparison + delete-then-create replace semantics computed inline
- apps/api/src/modules/listing/application/use-cases/update-listing-group.use-case.ts:67-89 — status-based edit guard plus archived→draft reopen cascade (status transition!) hand-rolled inline instead of a domain transition
- apps/api/src/modules/listing/application/use-cases/moderation/publish-listing.use-case.ts:47-56 and publish-listing-group.use-case.ts:48-56 — contact-flag publish gate + force-override branching duplicated at listing and group level
- apps/api/src/modules/listing/application/moderation/run-group-moderation.ts:67-73 — empty-group submit rule inline in the shared tx body
- apps/api/src/modules/listing/application/moderation/run-group-moderation.ts:76-85 — action-string if/else mapping group action → child transition (state-machine knowledge outside the domain)
- apps/api/src/modules/listing/application/moderation/run-group-moderation.ts:100-105 — actorFromOutcome inference (hiddenBy ?? publishedBy ?? 'partner') is domain logic in application
- apps/api/src/modules/listing/application/moderation/moderation-support.ts:64-74 — submittedAt/publishedAt first-publish stamping rules in an application helper (uses app clock new Date())
- apps/api/src/modules/listing/application/use-cases/moderation/submit-listing.use-case.ts:44-50 (+ publish/hide/republish twins) — GROUP_MANAGED_LISTING guard repeated in four use-cases
- apps/api/src/modules/listing/infrastructure/repositories/prisma-listing.repository.ts:52-61 — cancellation-policy fallback chain (listing→partner→tenant) — a §11.3 business rule — implemented in the repository mapper
- apps/api/src/modules/listing/infrastructure/repositories/prisma-listing.repository.ts:182 — public visibility rule (status='published' AND partner approved) encoded as a repo where-clause
- apps/api/src/modules/listing/infrastructure/repositories/prisma-commission-coverage.reader.ts:19-37 — commission precedence (partner>category/listing_type>tenant_default) + effective-date windowing encoded in SQL ORDER BY
- apps/api/src/modules/listing/application/use-cases/get-public-listing-group.use-case.ts:41,47,76 — published-group/approved-partner/published-children visibility filtering inline (vs the repo-level rule the standalone path uses)
- apps/api/src/modules/listing/application/use-cases/delete-cancellation-policy.use-case.ts:34-41 and delete-tenant-cancellation-policy.use-case.ts:40-47 — in-use delete guard duplicated

**Port hiện tại:** Record-type ports, one per table, all methods take PrismaTx as first arg (forTenant-compatible). Read side is FAT: ListingRecord (~45 fields) embeds joined partner summary, resolved cancellationPolicy AND effectiveCancellationPolicy+source (fallback computed in the repo), rating aggregates; PublicListingRecord extends it with trust-signal joins (completedBookings, avgApprovalResponseSeconds via raw SQL). Write side is anemic field-bags: CreateListingData + UpdateListingData = Partial<Create> — no intent, any field writable. Money crosses as VND digit strings (rescheduleFee, price, salePrice), bigint only inside the quote calculator. ONE transition-shaped method exists: moderate(tx, id, ModerationUpdate{status, publishedBy, hiddenBy, submittedAt?, publishedAt?}) on both listing and group repos — the closest thing to applyTransition; everything else is generic CRUD (create/findById/findBySlug/list/listPage/update/delete) plus guard-query helpers (countBookings, countListings, countListingsUsing, findPartnerDefaultId/findTenantDefaultId). No optimistic concurrency/version field anywhere. Ports LISTING_REPOSITORY, RESOURCE_REPOSITORY, PRICING_RULE_REPOSITORY are exported from the module (listing.module.ts:162) and injected by booking, scheduling, and catalog use-cases.

**Outbox:** produces: listing.created, listing.updated, listing.deleted, listing.submitted, listing.published (emitted by both publish-listing and republish-listing), listing.hidden, listing_group.created, listing_group.updated, listing_group.reopened, listing_group.deleted, listing_group.submitted, listing_group.published (emitted by both publish-group and republish-group), listing_group.hidden, pricing_rule.created, pricing_rule.deleted, resource.created · consumes: review.created → ProjectReviewAggregatesUseCase (listing.module.ts:171) — recomputes listings.rating_avg/review_count and listing_groups.* via raw SQL

**Rủi ro refactor:**
- Cross-module port coupling: listing.module.ts:162 exports LISTING_REPOSITORY, RESOURCE_REPOSITORY, PRICING_RULE_REPOSITORY, injected by booking/create-booking + mark-returned, scheduling/availability-* (6 files), catalog/search-public-catalog — changing ListingRecord/port method shapes breaks three other modules; the fat read record must survive (or be split into a reader port) without touching those callers' semantics
- priceQuote (application/pricing.ts) and quote-calculator are plain-imported by booking and scheduling — quote math must remain a pure function importable across modules, not become an aggregate method
- scheduling consumes the 'listing.updated' outbox event (scheduling/infrastructure/http/scheduling.module.ts:88) — event names/payloads are an implicit contract; the refactor must not drop or rename emissions during moderation/update flows
- Outbox handler idempotency: ProjectReviewAggregatesUseCase is recompute-from-source (idempotent, uses DB now() in raw SQL); if transitions become event-driven booleans, group cascade currently THROWS on an invalid child state mid-loop (run-group-moderation.ts:76-85) — converting to no-throw must not silently half-cascade, and current HTTP error contracts (LISTING_ALREADY_PUBLISHED 400, LISTING_ADMIN_LOCKED 403, LISTING_NOT_IN_REVIEW 400) are load-bearing for the dashboard
- Clock split: moderation timestamps use the app clock (moderation-support.ts:67 new Date()) while review projection and commission effective-windows use DB now() — moving stamping into the aggregate must keep a deliberate clock decision (AGENTS.md says DB clock for time comparisons)
- bigint VND serialization: toVnd (group-stats.ts:38-42) deliberately accepts BOTH digit strings and numbers because prisma/seed.ts writes raw numbers into modeConfig jsonb — a stricter aggregate value-object parser would blank seeded prices; rescheduleFee/price/salePrice must keep bigint→string mapping at the repo boundary
- Slug uniqueness is check-then-insert; the DB @@unique([tenantId,slug]) (schema.prisma:988, :894) is the real guard — an aggregate cannot own this invariant, and a race currently leaks a raw Prisma P2002; keep the DB backstop and don't pretend the aggregate enforces it
- RLS: repos rely on the forTenant-set GUC for tenant scoping (findById/findBySlug have NO tenantId in where clauses) — any refactored repo/adapter must keep taking the tx from forTenant; a stray prisma.app call would silently return nothing or leak
- Group moderation writes 1 group + N children + N audit rows + 1 outbox row in ONE tx (run-group-moderation.ts:59-97), and update-listing-group.ts:81-83 fires child moderates via Promise.all inside a Prisma interactive tx — aggregate-per-child rehydration could multiply queries or hit tx timeouts on big posts
- GiST/double-booking is indirect: resources are the exclusion-constraint key on the booking side — Listing↔Resource binding rules (partner ownership, auto-create) must not change resource identity semantics
- PublicListingRecord.avgApprovalResponseSeconds and completedBookings read booking tables from the listing repo (prisma-listing.repository.ts:205-217) — a module-boundary violation already; moving it during the refactor changes the public read shape used by the storefront
- The three-level cancellation-policy fallback computed in prisma-listing.repository.ts:52-61 is consumed by booking's refund math — relocating it into domain must keep identical resolution for every existing read path

### scheduling — effort M (6 use-cases, 11 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/scheduling/domain/availability/interval.ts — half-open UTC Interval type + pure fns overlaps/overlapsAny/contains
- apps/api/src/modules/scheduling/domain/availability/date-util.ts — calendar-date pure helpers: parseDate, weekdayOf (UTC), eachDate inclusive range
- apps/api/src/modules/scheduling/domain/availability/open-windows.ts — WeeklyRule/DateException value types + openWindowsForDate pure fn (tz-aware, closed/custom_hours precedence)
- apps/api/src/modules/scheduling/domain/availability/slot-generator.ts — generateHourlySlots (grid x duration expansion, buffers, lead-time) + applyLiveHolds pure fns
- apps/api/src/modules/scheduling/domain/availability/day-availability.ts — computeDay pure fn: daily-mode status precedence blocked > closed > booked > available
- apps/api/src/modules/scheduling/domain/ports/availability-rule-repository.port.ts — IAvailabilityRuleRepository: flat AvailabilityRuleRecord, listByListing + atomic replaceForListing, takes PrismaTx
- apps/api/src/modules/scheduling/domain/ports/availability-exception-repository.port.ts — IAvailabilityExceptionRepository: flat AvailabilityExceptionRecord, listByResource/create(upsert)/delete/findById, takes PrismaTx
- apps/api/src/modules/scheduling/domain/ports/busy-reader.port.ts — IBusyReader read port: busyBookings (resource-scoped Interval[]) + inventoryUsage count
- apps/api/src/modules/scheduling/domain/ports/hold-reader.port.ts — IHoldReader read port: activeHolds from Redis (no tx), returns Interval[]
- apps/api/src/modules/scheduling/domain/ports/availability-cache.port.ts — IAvailabilityCache: CachedSlot (ISO-string) get/set + invalidateResource/invalidateListing/invalidateByBooking

**Aggregate sau refactor:**
- **ListingWeeklySchedule** — The weekly opening-hours rule set of one listing (availability_rules rows), replaced as a whole set. Write state: listingId + list of {dayOfWeek, openTime HH:MM, closeTime HH:MM}. Rehydrate from AvailabilityRuleRecord[]; create via static replaceWith(rules). Read projection (toRuleResponse) stays in scheduling.mapper.ts.
  - Invariants:
    - Each rule has openTime < closeTime (HH:MM 24h format)
    - dayOfWeek is an integer 0..6
    - At most 50 rules per listing
    - Rule set is replaced atomically as one operation (no partial replace)
    - Windows on the same weekday should not overlap (currently unenforced anywhere)
    - Only the owning partner (partner-scoped calls) may mutate the schedule
  - Đang enforce tại:
    - packages/contracts/src/contracts/availability.ts:17 (zod refine openTime<closeTime — transport layer only, domain trusts input)
    - packages/contracts/src/contracts/availability.ts:7 (weekdaySchema 0..6 — transport layer only; no DB CHECK)
    - packages/contracts/src/contracts/availability.ts:25 (.max(50) — transport layer only)
    - apps/api/src/modules/scheduling/infrastructure/repositories/prisma-availability-rule.repository.ts:38-48 (deleteMany+createMany inside the forTenant tx)
    - NOWHERE (same-weekday overlap is never checked — DB, contracts, and domain all accept overlapping windows)
    - apps/api/src/modules/scheduling/application/availability-support.ts:27-29 (partner-ownership 403 in application-layer helper assertListing)
- **ResourceCalendar** — The date-specific exception calendar of one resource (availability_exceptions rows) — closed days and custom_hours overrides shared by every listing on the resource. Write state: resourceId + exceptions keyed by date {type, openTime?, closeTime?, reason?}. Methods: addException (idempotent upsert semantics), removeException. The read-side open-window resolution (openWindowsForDate) already lives in domain and should become a method/collaborator of this aggregate.
  - Invariants:
    - At most one exception per (resource, date) — re-adding a date overwrites it
    - type=custom_hours requires both openTime and closeTime, with openTime < closeTime
    - type=closed carries no hours (currently unenforced: contracts superRefine only validates custom_hours, so a closed exception with openTime is accepted and stored)
    - An exception can only be deleted through the resource it belongs to
    - Only the owning partner (partner-scoped calls) may mutate the calendar
    - closed exception overrides weekly rules; custom_hours replaces them for that date
  - Đang enforce tại:
    - apps/api/prisma/schema.prisma:1075 (@@unique([resourceId, date])) + apps/api/src/modules/scheduling/infrastructure/repositories/prisma-availability-exception.repository.ts:55-77 (upsert on resourceId_date)
    - packages/contracts/src/contracts/availability.ts:42-57 (zod superRefine — transport layer only)
    - NOWHERE (closed-with-hours is storable; repo prisma-availability-exception.repository.ts:62-76 persists whatever arrives)
    - apps/api/src/modules/scheduling/application/use-cases/delete-availability-exception.use-case.ts:32-34 (manual existing.resourceId !== resourceId check)
    - apps/api/src/modules/scheduling/application/availability-support.ts:47-49 (assertResource 403)
    - apps/api/src/modules/scheduling/domain/availability/open-windows.ts:31-41 (already a pure domain fn — good)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/scheduling/application/use-cases/get-availability.use-case.ts:87-93 — business rule 'query.mode must be in listing.bookingModes' checked inline (MODE_NOT_ENABLED)
- apps/api/src/modules/scheduling/application/use-cases/get-availability.use-case.ts:99-109 — inventory availability computation inline: remaining = Math.max(0, stock - used) plus the day-window construction
- apps/api/src/modules/scheduling/application/use-cases/get-availability.use-case.ts:114-127 — fixed_packages branching + ListingModeConfigError-to-HTTP translation inline in the use-case
- apps/api/src/modules/scheduling/application/use-cases/get-availability.use-case.ts:138-155 — range-extension math (extensionDays from package durationDays, exceptionTo, rangeEnd = +2 days padding) is business window logic inline
- apps/api/src/modules/scheduling/application/use-cases/get-availability.use-case.ts:199-206 — duration-derivation rule (package durationMinutes/60 vs hourly.minDuration/maxDuration fallbacks) branched inline inside the cache-miss path
- apps/api/src/modules/scheduling/application/use-cases/get-availability.use-case.ts:252-259 — daily fixed-package branch + MODE_CONFIG_MISSING business check inline
- apps/api/src/modules/scheduling/application/use-cases/get-availability.use-case.ts:288-328 — private fixedDaily(): entire multi-day stay algorithm (per-date closed/blocked precedence, 'no rules = open' fallback, check-in/check-out interval construction, booked determination) as a use-case private method instead of domain
- apps/api/src/modules/scheduling/application/use-cases/get-availability.use-case.ts:330-366 — private daily(): weekdayOpen rule incl. 'no rules at all = always open' fallback (:341-343) and overnight night-interval construction (:346-365) in the use-case; only the final status precedence is delegated to domain computeDay
- apps/api/src/modules/scheduling/application/use-cases/list-availability-exceptions.use-case.ts:28-29 — 180-day listing-horizon policy hardcoded inline (utcNow + addDays(180))
- apps/api/src/modules/scheduling/application/availability-support.ts:27-29,47-49 — partner-ownership business rule (NOT_OWNED) as free functions in the application layer, duplicated across 5 use-cases via assertListing/assertResource
- apps/api/src/modules/scheduling/infrastructure/repositories/prisma-busy-reader.ts:29-31 — the business definition of 'busy' (statuses pending_payment/pending_approval/confirmed, modes NOT IN inventory/class) lives in a repo SQL where-clause, duplicating the GiST constraint predicate
- apps/api/src/modules/scheduling/infrastructure/repositories/prisma-busy-reader.ts:40-43 — inventory-commitment rule (active statuses + returned_at IS NULL + overdue via upper(blocked_period) <= now()) encoded in repo SQL
- packages/contracts/src/contracts/availability.ts:17,42-57 — the ONLY enforcement of rule/exception shape invariants (openTime<closeTime, custom_hours pairing) is transport-layer zod; domain fns (open-windows.ts:25) trust input blindly, so any non-HTTP caller bypasses all invariants

**Port hiện tại:** Flat anemic record types of primitives: AvailabilityRuleRecord/AvailabilityExceptionRecord are {string id, string listingId/resourceId, HH:MM strings, YYYY-MM-DD string, nullable strings} with parallel *InputData shapes — no domain types, no aggregate state interfaces. Every persistence method takes PrismaTx as first arg (correct per house rule). Granularity is CRUD-ish but already coarse where it matters: replaceForListing replaces the whole weekly set atomically (closest thing to an aggregate-save); exceptions are per-row create(upsert)/delete/findById. No applyTransition-style methods and no status fields exist in this module (nothing is a state machine). Alongside the two write repos sit three read-only ports: IBusyReader (returns domain Interval[] — nice), IHoldReader (Redis, no tx), and IAvailabilityCache (string-serialized CachedSlot, invalidate-by-resource/listing/booking). Ports are in decent shape for the refactor: mainly need rehydrate-friendly load (rules-for-listing, exceptions-for-resource) + save(aggregate-emitted state), which replaceForListing/upsert already approximate.

**Outbox:** produces: (none) · consumes: booking.created, booking.confirmed, booking.expired, booking.rejected, booking.cancelled, booking.completed, booking.returned, booking.no_show, pricing_rule.created, pricing_rule.deleted, listing.updated

**Rủi ro refactor:**
- Busy-set predicate duplication: prisma-busy-reader.ts:29-31 must stay byte-for-byte in sync with the GiST bookings_no_overlap partial-constraint predicate (prisma/migrations/20260709000001_rls_domain_and_constraints/migration.sql:85-90). Moving 'what counts as busy' into a domain object risks divergence — the GiST constraint is the hard guarantee, this reader is only the soft/display one.
- Clock mixing: slot availability bakes the app clock (utcNow at get-availability.use-case.ts:175) into CACHED slots — the lead-time boundary is stale up to the 60s TTL by design (redis-availability-cache.ts:7-8) — while inventoryUsage uses DB now() (prisma-busy-reader.ts:43). An aggregate/domain-service refactor must keep which clock feeds which rule, or overdue-inventory and lead-time behavior silently shifts.
- Cache-contract sensitivity: Redis keys (avail:hourly:{listing}:{date}:{selectionKey}, avail:res:{resourceId}, avail:listing:{listingId}), the selectionKey='flexible'|packageId convention (get-availability.use-case.ts:179), and the ISO-string CachedSlot shape are an implicit contract; changing serialization while refactoring corrupts/misses cache and the per-resource index-SET invalidation scheme (redis-availability-cache.ts:49-60).
- invalidateByBooking opens its OWN forTenant tx inside an infra adapter (redis-availability-cache.ts:76-78) called from outbox handlers — refactoring who resolves bookingId→resourceId must not end up nesting forTenant or moving the lookup inside a caller's tx.
- Outbox handler idempotency currently comes free (handlers are pure cache deletes, scheduling.module.ts:75-92, at-least-once redelivery harmless); if the refactor makes any handler touch aggregate state it must stay no-throw/idempotent per the target style.
- Hidden cross-module Redis contract: RedisHoldReader re-declares the booking module's ZSET key shape holds:{resourceId} / member startMs:endMs:holdId scored by expiry (redis-hold-reader.ts:20-27, deliberately not imported to respect module boundaries). Any hold-semantics remodel silently breaks parity with the booking-module writer.
- Heavy cross-module coupling in GetAvailabilityUseCase: it injects listing-module ports (LISTING_REPOSITORY, PRICING_RULE_REPOSITORY) and plain-imports listing domain fns priceQuote + findActivePackage and tenancy's ResolveTenantByHostUseCase (get-availability.use-case.ts:12-46). A scheduling aggregate cannot own pricing; the refactor must draw the seam so priced-slot generation stays a composition, not pull pricing state into a scheduling aggregate.
- Timezone/DST edge cases are concentrated and untested (NO TESTS policy): overnight night-interval spans midnight across calendar days (get-availability.use-case.ts:352-364), zonedTimeToUtc conversions in open-windows.ts:49-50 — behavior-preserving moves are verify-by-running only.
- Hot unauthenticated path: GET /public/listings/:slug/availability is the storefront calendar (public-availability.controller.ts:16-27); per-date × per-slot object allocation from richer aggregate instances is a real latency risk on 31-day ranges with per-slot priceAt callbacks.
- RLS: rule/exception repos rely on tx-scoped RLS with no tenant_id in where-clauses (prisma-availability-rule.repository.ts:25, prisma-availability-exception.repository.ts:38); every new/reshaped repo method must keep taking PrismaTx or tenant isolation silently breaks. availability_rules/availability_exceptions RLS policies: prisma/migrations/20260709000001_rls_domain_and_constraints/migration.sql:36-37.
- Money discipline: prices flow through the module as already-serialized bigint-VND strings (priceQuote().subtotal, CachedSlot.price); any aggregate that parses them to number corrupts large amounts — keep them opaque strings.
- Tightening currently-unenforced invariants (same-weekday overlap ban, closed-exception-with-hours ban) inside new aggregates is a behavior change: existing rows/clients (e.g. dashboard QuickBlockDialog posting closed blocks) could start failing — decide enforce-vs-normalize before rehydrate throws on legacy state.

### payments — effort L (14 use-cases, 12 endpoints)

**domain/ hiện tại:**
- domain/gateway-limits.ts — two MoMo bigint constants (MOMO_MIN_REFUND_VND 1,000; MOMO_MAX_PAYMENT_VND 50,000,000) with the full-refundability rationale
- domain/method-routing.ts — pure fn pickConfigForMethod(configs, method): wallet method routes 1:1 to its wallet gateway config, base method to the active non-wallet config that enables it
- domain/payment-status.ts — pure fns canSucceed(status) [DEAD: never imported anywhere], amountMatches(expected, paid) (underpay rejects, overpay accepts), publicPaymentStatus(null→'none')
- domain/ports/crypto.port.ts — CryptoPort (encrypt/decrypt) for AES-256-GCM credential storage
- domain/ports/gateway-config-repository.port.ts — GatewayConfigRecord (decrypted creds + settings) + IGatewayConfigRepository (findActiveAll/findActiveBase/findByGateway/upsert/deactivate/updateSettings)
- domain/ports/gateway-registry.port.ts — GatewayRegistryPort: statelessByKey (creds-free peek) + resolveForTenant (mock fallback)
- domain/ports/payment-booking-reader.port.ts — payments-owned read model of Booking (status, bookingMode, depositAmount, securityDeposit, finalAmount, paidAmount)
- domain/ports/payment-gateway.port.ts — provider adapter port: createPayment/providerPaymentMethod/peekReference/verifyWebhook/refund/queryPaymentStatus + GatewayKey/WebhookEvent types
- domain/ports/payment-repository.port.ts — PaymentRecord/PaymentRef/PaymentHistoryRecord records + IPaymentRepository incl. guarded transitions markSucceeded/markTerminalIfPending and admin-pool scans (findActivePendingByBooking is DEAD: implemented, never called)
- domain/ports/refund-repository.port.ts — RefundRecord/CreateRefundData/history+recovery records + IRefundRepository incl. guarded transitions completeAutomatic/requireManual/markSucceeded and lockForBooking (pg advisory xact lock)

**Aggregate sau refactor:**
- **Payment** — One gateway payment attempt for a booking: amount (bigint VND), kind (full/deposit), one-way status machine (pending → succeeded terminal; failed/expired only from pending; late success may override failed/expired), gateway references (orderRef/txnId/orderId), idempotency key, paidAt. Static create(booking, routedGateway, method) computes amount/kind and validates checkout preconditions; rehydrate(state) + no-throw boolean transitions succeed(amountPaid)/fail()/expire() that map to guarded compare-and-set writes.
  - Invariants:
    - succeeded is terminal; a late failed/expired never clobbers it; failed/expired only applies while pending; a late success MAY override failed/expired (repo guard is status <> 'succeeded', NOT = 'pending' — the dead domain fn canSucceed says pending-only and would change behavior)
    - paid amount >= expected amount to confirm (underpayment never confirms, overpayment accepted)
    - checkout only for a booking in status pending_payment
    - checkout amount = depositAmount + securityDeposit; kind = 'full' iff depositAmount >= finalAmount
    - MoMo payment must not exceed 50,000,000 VND (keeps it single-call refundable)
    - mock gateway must never take a production payment (unless ALLOW_MOCK_PAYMENTS)
    - at most one reusable pending checkout per (booking, providerPaymentMethod) — retries return the stored handoff
    - a 'refunded' webhook event never downgrades the original succeeded payment
    - idempotency key format checkout:{bookingId}:{method}:{orderRef} unique globally; (gateway, gatewayTxnId) and (gateway, gatewayOrderRef) unique
  - Đang enforce tại:
    - apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts:125-133 (markSucceeded raw SQL, WHERE status <> 'succeeded' + paid_at=now())
    - apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts:138-145 (markTerminalIfPending, WHERE status = 'pending')
    - apps/api/src/modules/payments/domain/payment-status.ts:9-15 (canSucceed DEAD; amountMatches used)
    - apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.ts:58-79 (refunded-ignore, terminal branch, amount guard)
    - apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts:70-91 (duplicate of the same status/amount guards)
    - apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts:103-109 (pending_payment check)
    - apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts:135-136 (amount/kind computation)
    - apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts:140-150 (mock-in-prod guard)
    - apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts:153-159 (MoMo 50M cap)
    - apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts:128-133 + infrastructure/repositories/prisma-payment.repository.ts:78-101 (pending-checkout reuse)
    - apps/api/prisma/schema.prisma:1358,1369-1370 (unique idempotency_key, (gateway,gatewayTxnId), (gateway,gatewayOrderRef))
- **Refund** — One refund obligation for a payment: amount, reason (booking_cancellation/security_deposit/dispute_refund), affectsBookingStatus, executionMode (automatic/manual), status machine pending → succeeded | manual_required → succeeded, dueAt SLA, manual evidence {reference, evidenceKey, note}. Static create(payment, amount, reason, settings) decides automatic-vs-manual; rehydrate + boolean transitions completeAutomatic(refundId)/downgradeToManual(dueAt)/confirmManual(evidence).
  - Invariants:
    - at most one refund per (bookingId, reason) — idempotent under concurrent booking.cancelled/returned handlers (NO DB unique constraint; only exists-check + pg advisory xact lock)
    - refund amount must not exceed the captured payment amount; amount <= 0 is a no-op
    - automatic execution only when settings.refundStrategy = 'automatic_preferred' AND reason != 'security_deposit' AND (SePay CARD full-amount OR wallet gateway momo/zalopay); everything else is manual_required
    - security deposit is NEVER auto-refunded
    - dueAt = now + settings.manualRefundSlaHours for manual refunds (computed with app clock Date.now(), not DB clock)
    - status transitions guarded: completeAutomatic/requireManual only from (pending, automatic); markSucceeded only from pending|manual_required; confirming an already-succeeded refund is an idempotent no-op
    - manual confirmation reference must be unique per tenant (NO DB constraint — app-level count query)
    - completedAt set exactly when status becomes succeeded
  - Đang enforce tại:
    - apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts:41 (amount<=0), :46-49 (advisory lock + existsForBooking + nothing-paid), :51-57 (amount<=payment), :64-77 (automatic-vs-manual policy + dueAt), :82-87 (status/executionMode derivation)
    - apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts:58-60 (existsForBooking), :80-93 (completeAutomatic/requireManual guarded where-clauses), :100-106 (markSucceeded guarded), :108-112 (pg_advisory_xact_lock 'refund:'||bookingId), :52 (completedAt derived in create)
    - apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts:37-40 (pending+automatic precondition), :56-57 (reference fallback chain), :66-72 (unsupported→queryPaymentStatus→reconciled-void retry safety), :75-77 (re-lock + re-check), :97 (Date.now() dueAt)
    - apps/api/src/modules/payments/application/use-cases/confirm-manual-refund.use-case.ts:39 (succeeded idempotent no-op), :40-46 (confirmable-state check), :47-53 (tenant-unique manual reference)
    - apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts:39 (affectsBookingStatus default = reason !== 'security_deposit', hidden in the method signature)
    - nowhere (DB): no unique on (booking_id, reason), no unique on evidence reference — apps/api/prisma/schema.prisma:1376-1401 has only plain indexes
- **TenantGatewayConfig (per-tenant gateway set)** — The tenant's payment-gateway configuration group: per (gateway, environment) rows with AES-GCM-encrypted credentials, non-secret settings (enabledMethods, refundStrategy, manualRefundSlaHours), isActive. The aggregate is really the SET of a tenant's configs, because the core invariant (grouped single-active) spans rows. Owns activation/deactivation and settings changes; method-routing (pickConfigForMethod) already lives in domain and stays.
  - Invariants:
    - grouped single-active: at most ONE active BASE gateway (sepay/payos/mock) tenant-wide; each wallet (momo/zalopay) is independently toggleable but single-active across its own environments (sandbox row and production row must not both be live)
    - enabledMethods must be a subset of GATEWAY_SUPPORTED_METHODS[gateway]
    - credentials must match the per-gateway shape (sepay/momo/zalopay zod schemas)
    - settings can only be updated on a currently-active config (else GATEWAY_CONFIG_NOT_FOUND)
    - unique (tenantId, gateway, environment) row identity
    - a stored active config's credentials are never exposed via API (only merchantId/partnerCode/appId echoes)
  - Đang enforce tại:
    - apps/api/src/modules/payments/infrastructure/repositories/prisma-gateway-config.repository.ts:74-87 (grouped single-active enforced by an updateMany INSIDE the repo's upsert — core invariant living in infrastructure)
    - apps/api/src/modules/payments/application/use-cases/update-gateway-payment-settings.use-case.ts:31-39 (supported-methods subset)
    - apps/api/src/modules/payments/application/use-cases/upsert-gateway-config.use-case.ts:26-41 (per-gateway credential zod branching)
    - apps/api/src/modules/payments/infrastructure/repositories/prisma-gateway-config.repository.ts:121-131 (settings only on active config)
    - apps/api/prisma/schema.prisma:1419 (@@unique tenantId, gateway, environment)
    - apps/api/src/modules/payments/application/payments.mapper.ts:15-24 (credential non-exposure + 'active by definition' assumption)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- checkout.use-case.ts:103-109 — booking payability status check (business precondition) inline in use-case
- checkout.use-case.ts:113-119 — PAYMENT_METHOD_UNAVAILABLE branching after domain routing fn (decision logic split UC/domain)
- checkout.use-case.ts:135-136 — computed amount (deposit+securityDeposit) and kind (full vs deposit) inline
- checkout.use-case.ts:140-150 — mock-gateway-in-production business guard inline (env-var reads inside the rule)
- checkout.use-case.ts:153-159 — MoMo 50M cap check inline (constant is domain, rule application is UC)
- checkout.use-case.ts:180 — idempotency-key format rule composed inline
- handle-webhook.use-case.ts:58-73 — event-type business branching: refunded-never-downgrades and failed/expired-only-while-pending transitions decided in UC
- handle-webhook.use-case.ts:74-79 — amount-match guard + throw decided in UC (domain fn only computes the boolean)
- execute-refund.use-case.ts:39 — affectsBookingStatus business default derived from reason in the method signature
- execute-refund.use-case.ts:41-57 — amount<=0 no-op, per-(booking,reason) idempotency, nothing-paid short-circuit, refund<=payment rule — all inline
- execute-refund.use-case.ts:64-77 — automatic-vs-manual refund policy (sepay-CARD-full / wallet / security-deposit exclusions) + dueAt SLA computation inline
- execute-refund.use-case.ts:82-87 — status ('pending' vs 'manual_required') and executionMode derivation inline
- execute-automatic-refund.use-case.ts:37-40 — refund state preconditions (pending + automatic + payment match) inline
- execute-automatic-refund.use-case.ts:56-72 — gateway reference fallback chain + unsupported→provider-status→'reconciled:void' retry-safety branching inline
- execute-automatic-refund.use-case.ts:97 — manual SLA dueAt computed with Date.now() inline (app clock)
- confirm-manual-refund.use-case.ts:39-53 — refund status-machine checks (succeeded no-op, confirmable states) + tenant-unique reference rule inline
- upsert-gateway-config.use-case.ts:26-41 — per-gateway credential-shape if/else zod branching in UC
- update-gateway-payment-settings.use-case.ts:31-39 — enabledMethods-subset validation in UC
- prisma-gateway-config.repository.ts:74-87 — grouped single-active invariant (base group vs per-wallet) enforced by repository upsert, not domain
- prisma-payment.repository.ts:125-133 — payment transition predicate (status <> 'succeeded') exists ONLY in raw SQL; the domain fn canSucceed (payment-status.ts:9-11) is dead AND disagrees (pending-only)
- prisma-refund.repository.ts:80-106 — refund status-machine transitions encoded solely as updateMany where-clauses
- prisma-refund.repository.ts:52 — completedAt-iff-succeeded rule computed in repo create
- reconciliation.worker.ts:70-91 — copy of the webhook's status branching + amount guard (rule fragment duplicated between handle-webhook.use-case.ts:62-79 and the worker)
- webhook.controller.ts:43 — per-gateway ack-body branching (zalopay return_code vs success) in the controller

**Port hiện tại:** Record-type ports with flat primitive fields (string ids, bigint amounts, Prisma enum types, Date) — PaymentRecord/PaymentRef/PaymentHistoryRecord, RefundRecord/RefundHistoryRecord/RefundRecoveryRecord/MissingRefundRecord, GatewayConfigRecord. Creates take data-bags (CreatePaymentData, CreateRefundData) where the CALLER supplies status/executionMode/dueAt (repo persists whatever it's given). Guarded-transition methods DO exist and return boolean or the updated record — markSucceeded/markTerminalIfPending on payments, completeAutomatic/requireManual/markSucceeded on refunds — i.e. applyTransition-style compare-and-set writes, but the transition predicates live in SQL/where-clauses, not in domain code. Read projections (paged history lists, admin-pool cross-tenant recovery scans with raw SQL joining bookings/booking_settlements/refunds) sit on the SAME ports as writes; PaymentRecord doubles as both write-state and read model (fat record: includes gatewayOrderId, paymentMethod, history fields). Concurrency primitive exposed as a port method (lockForBooking → pg_advisory_xact_lock). Dead members: IPaymentRepository.findActivePendingByBooking (never called), domain canSucceed (never imported). All tenant-scoped methods take PrismaTx first; admin-pool methods take none.

**Outbox:** produces: payment.succeeded (handle-webhook.use-case.ts:96-100; reconciliation.worker.ts:93-98 reconcile path; reconciliation.worker.ts:116-125 recovery path with recovery:true + skipBookingConfirmation), refund.execution_requested (execute-refund.use-case.ts:89-100 when automatic), refund.requested (execute-refund.use-case.ts:89-100 when manual; execute-automatic-refund.use-case.ts:100-111 on downgrade to manual), refund.completed (execute-automatic-refund.use-case.ts:82-93; confirm-manual-refund.use-case.ts:69-80; reconciliation.worker.ts:142-155 recovery re-emit), refund.recovery_requested (reconciliation.worker.ts:172-182) · consumes: refund.execution_requested → ExecuteAutomaticRefundUseCase (payments.module.ts:83-86, self-loop), booking.cancelled → ExecuteRefundUseCase reason booking_cancellation (payments.module.ts:89-97), booking.returned → ExecuteRefundUseCase reason security_deposit (payments.module.ts:98-106), booking.no_show → ExecuteRefundUseCase reason security_deposit (payments.module.ts:107-115), settlement.refund_requested → ExecuteRefundUseCase reason dispute_refund (payments.module.ts:116-129), refund.recovery_requested → ExecuteRefundUseCase (payments.module.ts:130-133, self-loop)

**Rủi ro refactor:**
- Concurrent-webhook atomicity: the pending→succeeded flip is a single guarded UPDATE (prisma-payment.repository.ts:125-133). A naive aggregate load→check→save would reintroduce the race the comment at handle-webhook.use-case.ts:62-66 explicitly warns about ('the pre-tx snapshot can't be trusted'). Aggregate transitions must stay compare-and-set: the aggregate returns intent, the repo keeps the WHERE-guarded write and reports the boolean.
- Semantic trap: repo markSucceeded guards WHERE status <> 'succeeded' (a late success may override failed/expired), but the existing dead domain fn canSucceed (payment-status.ts:9-11) says pending-only. Reviving canSucceed as the aggregate's rule would silently break late-success recovery.
- Advisory-lock coupling: refund idempotency = pg_advisory_xact_lock('refund:'||bookingId) (prisma-refund.repository.ts:108-112) + existsForBooking, with NO DB unique on (booking_id, reason). The lock is xact-scoped, so the aggregate op must run inside the same forTenant tx that took the lock; also renaming refund reason strings breaks idempotency history.
- Two-phase automatic refund (execute-automatic-refund.use-case.ts): prepare-tx → provider network call OUTSIDE any tx → commit-tx with re-lock + re-check. This cannot be folded into one aggregate method executed in one forTenant; the aggregate must model 'refund in flight' across two transactions.
- Clock discipline is mixed: stale-payment detection and paid_at use the DB clock (now() in prisma-payment.repository.ts:131,176 per outbox convention), but refund dueAt uses app-clock Date.now() (execute-refund.use-case.ts:77, execute-automatic-refund.use-case.ts:97) and completedAt uses new Date() (prisma-refund.repository.ts:52,82,102). Moving dueAt computation into a domain factory either freezes the app-clock bug or must inject a clock.
- Outbox handler idempotency chain: booking.cancelled/returned/no_show/settlement.refund_requested all funnel into ExecuteRefundUseCase and rely on the lock+exists pattern; reconciliation re-emits payment.succeeded/refund.completed with recovery:true and skipBookingConfirmation, and downstream Booking/Finance guards depend on exact payload shapes (amounts as strings — bigint must be .toString()'d or outbox JSON serialization throws).
- Cross-module raw SQL in the payments repo (prisma-payment.repository.ts:190-227, prisma-refund.repository.ts:139-200) joins bookings, booking_settlements, refunds on the admin pool (BYPASSRLS). These are recovery projections, not aggregate state — they must stay outside the aggregate, and any Booking/Finance schema change silently breaks them.
- RLS pool discipline: webhook + reconciliation resolve the tenant via prisma.admin (findByGatewayReference/findStalePending), then re-enter forTenant. The refactor must not move admin-pool reads inside tenant aggregates or vice versa.
- Gateway-config single-active invariant spans multiple rows (prisma-gateway-config.repository.ts:74-87 updateMany-then-upsert in one tx). Modeling it as an aggregate means loading the whole tenant config group; getting it wrong lets a sandbox and production wallet row both stay active and webhook verification picks the wrong credentials (the exact bug the comment describes).
- Credentials handling: repo decrypts AES-GCM on every read (toRecord); an aggregate holding decrypted creds enlarges the plaintext surface. Settings zod-parse failure silently falls back to DEFAULT_GATEWAY_PAYMENT_SETTINGS (prisma-gateway-config.repository.ts:36) — an aggregate that validates strictly would start rejecting rows that today degrade gracefully.
- Webhook HTTP contract: rawBody:true signature verification and per-gateway ack bodies (webhook.controller.ts:27-29,43 — ZaloPay needs return_code:1) must not change; providers retry on anything else.
- Checkout reuse depends on gatewayPayload JSON shape ({destination} with a legacy {paymentUrl} fallback, prisma-payment.repository.ts:89-100); moving handoff storage into aggregate state must keep parsing old rows.
- No GiST/ledger triggers live in THIS module (exclusion constraint is booking's; ledger writes are finance's, driven by payment.succeeded/refund.completed) — but that means payments refactor bugs surface as missing/duplicate downstream ledger entries, detectable only via the reconciliation backstops.

### booking — effort L (20 use-cases, 22 endpoints)

**domain/ hiện tại:**
- domain/booking-state-machine.ts — §8.2 transition edge table (from,to,actors) + canTransition/assertTransition throwing BookingTransitionError; the only status-change gate
- domain/cancellation-policy.ts — pure tiered refund: hoursUntil, refundPercent(rules,hours), computeRefund(paid,percent) with percent clamp
- domain/deposit-settlement.ts — pure settleDeposit(securityDeposit,damage,lateFee) → {refund,shortfall}
- domain/late-fee.ts — pure overduePeriods(returnedAt,dueAt,unit) + lateFee(periods,rate,qty)
- domain/inventory-stock.ts — pure hasCapacity(stock,used,requested) + remainingStock
- domain/no-show-window.ts — pure isWithinNoShowWindow(timeslotEnd,now), 48h constant
- domain/slot-policy.ts — pure validateSlotPolicy (mode config presence, granularity, min/max duration, lead time, open-hours/exceptions) returning error-code string or null
- domain/blocked-period.ts — pure blockedPeriod(timeslot,bufferBefore,bufferAfter) → exclusion-constraint key
- domain/booking-code.ts — pure BK-XXXXXX generator with injected RNG
- domain/mask-phone.ts — pure maskPhone for the partner PII boundary (§7.3)
- domain/booking-errors.ts — SlotTakenError / SlotHeldError / IdempotencyConflictError (DB/Redis race markers rethrown by repo/store)
- domain/ports/booking-repository.port.ts — IBookingRepository + fat BookingRecord read-join record, InsertBookingData, TransitionParams, FulfillmentPatch, filter/stat types
- domain/ports/booking-availability-reader.port.ts — IBookingAvailabilityReader.read(tx,listingId,resourceId) → weekly/exceptions schedule
- domain/ports/hold-store.port.ts — IHoldStore acquire/release Redis slot hold (Layer 1)
- domain/ports/otp-store.port.ts — IOtpStore issue/verify guest-access OTP. NOTE: no domain/entities/ — the domain is 100% pure functions, no aggregate class exists

**Aggregate sau refactor:**
- **Booking (single aggregate root; BookingStatusHistory as owned child appended per transition; value objects: Timeslot/BlockedPeriod, Money amounts, CancellationPolicySnapshot, CommissionSnapshot, PromotionSnapshot, FulfillmentState)** — Owns: status + actor-gated lifecycle (draft→pending_payment/pending_approval→confirmed→completed/no_show/cancelled→refunded, expired restore), timeslot+blocked_period, guestCount/quantity, all money columns (total/discount/final/deposit/paid/refundDue/securityDeposit/damage/additionalCharges bigint VND), frozen snapshots (pricing/commission/promotion/cancellation-policy/affiliate), inventory fulfillment (pickedUpAt/returnedAt/damageAmount), expiresAt deadline, partnerNote, idempotencyKey+code identity. Read projections (listing/partner/resource/customer joins, partner calendar, stats) stay outside.
  - Invariants:
    - 1. Status may only change along the §8.2 edge table and only by an allowed actor
    - 2. No two active bookings overlap an exclusive resource's blocked_period (hourly/daily modes)
    - 3. One booking per (tenant_id, idempotency_key); a lost insert race resolves to the winner's booking
    - 4. startUtc < endUtc and not in the past at creation; slot must satisfy the listing's mode config (granularity, min/max duration, lead time, open hours/exceptions)
    - 5. Only a published listing with the requested mode enabled can be booked; quoted subtotal must match the client's expectedSubtotal if supplied
    - 6. Inventory mode never oversells: quantity + committed usage (incl. unreturned overdue rentals) <= stockQuantity, serialized by per-listing advisory lock
    - 7. Customer deposit must cover the tenant's gross commission (non-house partners)
    - 8. draft activates to pending_approval iff listing.approvalRequired (24h deadline) else pending_payment (15min deadline); approve resets a fresh 15min payment deadline
    - 9. Customer cancel refunds per the SNAPSHOTTED policy tiers vs DB-clock hours-to-start; partner/tenant cancel is always 100%; security deposit is always refunded in full on cancel
    - 10. Confirm is idempotent (already confirmed/completed/no_show is a no-op); confirm sets paidAmount = depositAmount; expired→confirmed restore must re-pass the exclusion check or auto-refund deposit+securityDeposit without transitioning
    - 11. no_show only after timeslot end and within 48h of it, partner/tenant actor only
    - 12. complete (non-inventory) only after endUtc (DB clock), never for inventory mode, and reported onsite cash must equal finalAmount+additionalCharges−paidAmount
    - 13. pick-up only while confirmed; return only for inventory mode: computes late fee (unit/rate from listing modeConfig, fallback basePrice) and deposit settlement, appends late_fee charge, then completes
    - 14. pending_payment past expiresAt expires UNLESS a succeeded payment exists; pending_approval past expiresAt auto-rejects
    - 15. Every transition appends exactly one booking_status_history row atomically
    - 16. Partner writes only on bookings where booking.partnerId = acting partner (404/403)
    - 17. Partner never sees customer email; phone unmasked only in confirmed/completed/no_show (read-side, stays in mapper)
  - Đang enforce tại:
    - 1: domain/booking-state-machine.ts:51-66 called from application/use-cases/cancel-booking.use-case.ts:50, application/apply-partner-transition.ts:35, application/use-cases/confirm-booking.use-case.ts:49, application/use-cases/mark-completed.use-case.ts:43, application/use-cases/mark-returned.use-case.ts:47, application/use-cases/finalize-refunded-booking.use-case.ts:23, infrastructure/booking-scheduler.worker.ts:75; plus optimistic WHERE status=from in infrastructure/repositories/prisma-booking.repository.ts:206-219
    - 2: DB GiST EXCLUDE bookings_no_overlap in prisma/migrations/20260709000001_rls_domain_and_constraints/migration.sql:84-90, surfaced via prisma-booking.repository.ts:138-141,210 as SlotTakenError; Redis Layer-1 hold in create-booking.use-case.ts:251-274
    - 3: DB unique index (detected prisma-booking.repository.ts:143-149,186); pre-checks + loser re-read in create-booking.use-case.ts:123-126,225-226,256-257,284-300
    - 4: create-booking.use-case.ts:107-120 (range/past) + domain/slot-policy.ts:43-109 called at create-booking.use-case.ts:149-165
    - 5: create-booking.use-case.ts:133-146 (published/mode), 187-194 (PRICE_CHANGED)
    - 6: domain/inventory-stock.ts:7 + advisory lock/count in prisma-booking.repository.ts:451-479, orchestrated create-booking.use-case.ts:222-247
    - 7: create-booking.use-case.ts:383-399 (tenantCommissionGross math + DEPOSIT_BELOW_TENANT_COMMISSION)
    - 8: create-booking.use-case.ts:438-449; approve deadline approve-booking.use-case.ts:25 (app clock utcNow)
    - 9: cancel-booking.use-case.ts:52-61 + domain/cancellation-policy.ts:19-30 (DB clock via tenantDb.databaseNow)
    - 10: confirm-booking.use-case.ts:48 (idempotent set), :60 (paidAmount), :34-39+98-118 (SlotTaken auto-refund, fresh tx, emits booking.cancelled with depositAmount+securityDeposit, NO transition)
    - 11: domain/no-show-window.ts:13-20 called from mark-no-show.use-case.ts:49-57
    - 12: mark-completed.use-case.ts:29-64 (+sumCharges helper :84-93)
    - 13: mark-picked-up.use-case.ts:23-29 (raw status check, bypasses state machine); mark-returned.use-case.ts:40-67 + domain/late-fee.ts + domain/deposit-settlement.ts
    - 14: SQL in infrastructure/booking-scheduler.worker.ts:58-67 (CASE target status + NOT EXISTS succeeded payment), re-asserted :75
    - 15: prisma-booking.repository.ts:221-226 (history INSERT inside applyTransition)
    - 16: application/partner-owned-booking.ts:17-29; duplicated in update-partner-note.use-case.ts:38-44; 404-not-403 probe rule in get-booking.use-case.ts:24 and get-booking-history.use-case.ts:34
    - 17: application/booking.mapper.ts:57-75 (PHONE_REVEALED_STATUSES + toPartnerCustomer)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- create-booking.use-case.ts:107-120 — inline INVALID_RANGE / SLOT_IN_PAST business validation in use-case
- create-booking.use-case.ts:133-146 — listing published/mode-enabled business checks as inline if/throw
- create-booking.use-case.ts:187-194 — PRICE_CHANGED subtotal-integrity rule inline
- create-booking.use-case.ts:227-239 — capacity rule assembly; error message recomputes Math.max(0, stock-used), duplicating domain/inventory-stock.ts remainingStock
- create-booking.use-case.ts:329-341 — discount/finalAmount derivation (promo-or-subtotal) computed in use-case
- create-booking.use-case.ts:375-399 — commission-split basis selection (fundedBy branch), tenantCommissionGross computation, isHouse branch, DEPOSIT_BELOW_TENANT_COMMISSION invariant — pure money rules inline in use-case
- create-booking.use-case.ts:438-441 — approvalRequired branching + hardcoded 15min/24h deadline policy (app clock utcNow, not DB clock)
- approve-booking.use-case.ts:25 — copy of the 15-min payment-deadline fragment (addMinutes(utcNow(),15)) duplicated from create-booking.use-case.ts:441
- cancel-booking.use-case.ts:52-61 — actor-based refund branching (customer=policy tiers, partner/tenant=100%), security-deposit-always-returned rule, refund computation — core settlement logic in use-case
- confirm-booking.use-case.ts:48 — hand-rolled idempotency status-set check ['confirmed','completed','no_show'] in use-case
- confirm-booking.use-case.ts:60 — business assignment paidAmount = depositAmount passed as a column patch
- confirm-booking.use-case.ts:64-86 — wasExpired promo re-reserve branch with tolerated-ConflictException policy
- confirm-booking.use-case.ts:105-117 — auto-refund amount rule (depositAmount + securityDeposit) computed inline; emits booking.cancelled with no state transition
- mark-completed.use-case.ts:29-42 — INVENTORY_REQUIRES_RETURN mode branch + SERVICE_NOT_ENDED time check inline
- mark-completed.use-case.ts:45-64 — expectedOnsite settlement math (finalAmount+charges−paidAmount) + mismatch rule in use-case; sumCharges jsonb parser at :84-93 is domain logic living in the use-case file
- mark-picked-up.use-case.ts:23-29 — raw status !== 'confirmed' check bypassing the state machine (pickup is a state change with no status-machine representation)
- mark-returned.use-case.ts:40-46 — NOT_INVENTORY mode branch inline
- mark-returned.use-case.ts:49-62 — late-fee input resolution (unit fallback 'day', rate fallback lateFeePerUnit→basePrice→0) + additional_charges [{type:'late_fee'}] construction in use-case
- update-partner-note.use-case.ts:38-44 — ownership rule copy-pasted instead of loadOwnedBooking
- booking-scheduler.worker.ts:58-67 — expiry/auto-reject business rule encoded in raw SQL (status→target CASE + never-expire-if-paid NOT EXISTS), invisible to the domain layer
- prisma-booking.repository.ts:213-219 — repository throws Nest ConflictException BOOKING_STATE_CHANGED (HTTP concern in infra layer)
- prisma-booking.repository.ts:260 — business filter (draft/expired never occupy the partner calendar) hardcoded in repo where-clause
- prisma-booking.repository.ts:470-478 — which statuses commit stock + unreturned-overdue-blocks-rerental rule (upper(blocked_period) <= now()) encoded only in repo SQL
- booking.module.ts:94-103 — cross-module payload flag semantics (skipBookingConfirmation / affectsBookingStatus) branched in the module wiring

**Port hiện tại:** Record-typed and fat-read-shaped. IBookingRepository (domain/ports/booking-repository.port.ts) returns BookingRecord everywhere — a wide READ projection with joined display fields (listingTitle/Slug/Description/ImageUrl/Attributes, partnerName, resourceName) and raw customer PII (BookingCustomerRecord with real phone+email), even from WRITE methods: insertDraft, applyTransition, patchFulfillment, updatePartnerNote all return the fat joined record (repo re-SELECTs after each write, prisma-booking.repository.ts:500-504). Writes are column-patch style, not aggregate-persist: insertDraft(tx, tenantId, InsertBookingData) takes a ~28-field primitive bag; applyTransition(tx, TransitionParams{id,from,to,actor,actorId,reason,+optional column patches expiresAt/paidAmount/refundDueAmount/refundPercent}) DOES exist and is the single choke point for status writes — it guards WHERE status=from, maps GiST violation→SlotTakenError, and appends the history row atomically; patchFulfillment(tx,id,FulfillmentPatch) is a partial-column patch. Money is bigint, time is Date, all snapshots/jsonb are `unknown` (no domain types); status typed as contracts BookingStatus, actor as domain TransitionActor. All methods take PrismaTx first (correct). No save(aggregate), no narrow write-state record, no rehydrate source distinct from the read projection. Side ports (hold-store, otp-store, availability-reader) are already narrow and clean.

**Outbox:** produces: booking.created (create-booking.use-case.ts:450), booking.approved (approve-booking.use-case.ts:24 via apply-partner-transition.ts:46), booking.rejected (reject-booking.use-case.ts:23 via apply-partner-transition; also booking-scheduler.worker.ts:61 auto-reject), booking.no_show (mark-no-show.use-case.ts:31 via apply-partner-transition, payload +securityDeposit), booking.confirmed (confirm-booking.use-case.ts:88), booking.cancelled (cancel-booking.use-case.ts:73 with refundAmount/refundPercent; also confirm-booking.use-case.ts:105 late-webhook auto-refund), booking.completed (mark-completed.use-case.ts:74 with onsiteCollectedAmount; also mark-returned.use-case.ts:86 second emit), booking.returned (mark-returned.use-case.ts:76 with lateFee/depositRefund/depositShortfall), booking.picked_up (mark-picked-up.use-case.ts:33), booking.refunded (finalize-refunded-booking.use-case.ts:31), booking.expired (booking-scheduler.worker.ts:61) · consumes: payment.succeeded → ConfirmBookingUseCase, honoring skipBookingConfirmation flag (booking.module.ts:94-98), refund.completed → FinalizeRefundedBookingUseCase, honoring affectsBookingStatus flag (booking.module.ts:99-103)

**Rủi ro refactor:**
- Mixed clock sources are load-bearing: cancel refund tiers, no-show window, completion gate, pickup/return timestamps use tenantDb.databaseNow(tx); create/approve deadlines use app-clock utcNow() (create-booking.use-case.ts:114,440; approve-booking.use-case.ts:25). Aggregate methods must take `now` as a parameter and callers must keep passing the SAME source each did before, or expiry/no-show boundaries shift.
- applyTransition's optimistic `WHERE status = from` (prisma-booking.repository.ts:206-208) is the race guard between webhook, scheduler sweep, and partner actions (scheduler tolerates its 409 at booking-scheduler.worker.ts:86-89). A rehydrate→mutate→save aggregate persist that writes unconditionally reintroduces lost-update races; the conditional UPDATE (or a version column) must survive the refactor.
- GiST exclusion (bookings_no_overlap) fires at UPDATE time when RE-ENTERING an active status (expired→confirmed restore) — slot availability is not decidable in-memory, so a no-throw boolean transition method cannot answer it; SlotTakenError must keep flowing from the repository, and confirm's poisoned-tx recovery (confirm-booking.use-case.ts:34-39 opens a SECOND forTenant tx) cannot live inside one aggregate call.
- Outbox handlers are at-least-once: confirm (status-set no-op at confirm-booking.use-case.ts:48) and finalize-refunded (early return :22) must map onto the planned idempotent boolean transitions exactly — if the new aggregate throws BookingTransitionError where today it no-ops, the relay will retry forever (no dead-letter).
- The late-webhook auto-refund deliberately emits booking.cancelled WITHOUT changing status (stays expired, confirm-booking.use-case.ts:98-118). An aggregate design that couples event emission to a successful transition breaks this path and strands customer money.
- Event payload shapes are consumed cross-module (payments settles refunds from booking.cancelled.refundAmount / booking.returned.depositRefund / booking.no_show.securityDeposit; finance/affiliate/promotions key off booking.completed/confirmed/rejected/expired/refunded). All bigints ride as .toString() strings; mark-returned's ORDER (booking.returned then booking.completed) matters. Changing payloads or order breaks ledger settlement.
- Idempotency + inventory concurrency choreography in create: pre-check → Redis hold (outside tx) → per-listing pg_advisory_xact_lock → count → insert → unique-index loser re-read (create-booking.use-case.ts:284-300). The advisory lock and the insert must remain in the same tx; the hold acquire/release brackets TWO forTenant calls and cannot be folded into the aggregate.
- RLS/pool split: history insert derives tenant_id via sub-select from bookings (prisma-booking.repository.ts:221-226, RLS-scoped); the scheduler scans cross-tenant on prisma.admin then re-enters forTenant per row. Moving history-append into an aggregate-emitted effect must keep both.
- Promo re-reserve on expired→confirmed tolerates exhaustion (ConflictException swallowed, confirm-booking.use-case.ts:79-85) — a stricter aggregate invariant here would fail legitimate late-payment confirms.
- Partner PII masking is keyed on raw status strings (booking.mapper.ts:57) — any change to status representation in the new aggregate state must not bypass the partner mapper, or unmasked phones leak.
- Repository currently throws Nest ConflictException (prisma-booking.repository.ts:213-219); replacing it with a domain error changes the HTTP contract (409 BOOKING_STATE_CHANGED) that the dashboard may rely on.
- sumCharges/additional_charges jsonb parsing exists in three shapes (mark-completed.use-case.ts:84-93, booking.mapper.ts:80-93, mark-returned's construction :62) — consolidating into one value object risks changing accepted malformed-data behavior silently.

### finance — effort XL (38 use-cases, 32 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/finance/domain/commission-split.ts — pure computeCommissionSplit(): 4-way VND bigint split (partner/platform/affiliate/tenantNet) with fundedBy basis rules, clamping and PARTNER_SHARE_FLOORED/TENANT_NET_NEGATIVE flags
- apps/api/src/modules/finance/domain/commission-snapshot.ts — CommissionSnapshot record type (rates as strings for JSON round-trip), defaultCommissionSnapshot(), snapshotToRates() parser
- apps/api/src/modules/finance/domain/commission-rule-precedence.ts — pure rule selection: isEffective(), ruleMatches(), selectCommissionRule() with partner>listing_type/category>tenant_default precedence map
- apps/api/src/modules/finance/domain/commission-rate-guard.ts — pure violatesTenantShareFloor() guard (platform% + affiliate% <= tenant%, waived for house partner / fixed rates) + TENANT_SHARE_FLOOR_CODE
- apps/api/src/modules/finance/domain/ledger-journal.ts — pure double-entry journal builders (revenue/cancellation-fee/clawback/payout), tenant-residual balancing, activeRevenueJournalId()/hasRevenueJournal() idempotency helpers, sum/isBalanced
- apps/api/src/modules/finance/domain/ports/settlement-repository.port.ts — ISettlementRepository + fat SettlementRecord (write state mixed with denormalized read fields) + ReleaseAmounts + SettlementSummary
- apps/api/src/modules/finance/domain/ports/payout-repository.port.ts — IPayoutRepository + PayoutRecord, per-transition methods (claimForPayment/markPaid/markFailed), advisory lockPayee, allocation methods
- apps/api/src/modules/finance/domain/ports/ledger-repository.port.ts — ILedgerRepository: recordJournal, entriesForBooking, ownerBalance, balancesByType, listEntries (read view), maturePayable (DB-clock)
- apps/api/src/modules/finance/domain/ports/settlement-dispute-repository.port.ts — ISettlementDisputeRepository + fat SettlementDisputeRecord (write state + booking/partner display fields)
- apps/api/src/modules/finance/domain/ports/commission-rule-repository.port.ts — ICommissionRuleRepository + CommissionRuleRecord, findIncompatibleListingsForRule (deposit-coverage check), setPlatformRate
- apps/api/src/modules/finance/domain/ports/finance-tenant-host-reader.port.ts — 1-method host→tenantId resolver port (storefront dispute path)

**Aggregate sau refactor:**
- **Settlement** — Custody lifecycle of one booking's online-held funds: held → dispute_window → (disputed) → released | refund_pending → refunded, kind (service_completed/customer_no_show/cancellation_fee), onlineHeldAmount, securityDepositHeld, onsiteCollectedAmount, refundedAmount, retainedAmount, refundId, disputeUntil/completedAt/releasedAt, frozen ReleaseAmounts
  - Invariants:
    - One settlement per booking / per payment; only created from a succeeded deposit|full payment; securityDeposit carved out of the held amount
    - Dispute window opens only from status=held; reported on-site amount must equal (final+charges − onlineHeld)
    - No-show commission base = onlineHeldAmount only (security deposit never forfeited as revenue)
    - Release only when status=dispute_window AND dispute_until <= DB now(); exactly one active revenue journal per booking (clawback resets the cycle)
    - Refund prepare allowed only from held/dispute_window/disputed; refunded_amount clamped to online_held; retained = max(held − refunded, 0); dispute refund is a cumulative delta, idempotent when already refund_pending
    - Refund finalize idempotent by refundId; full refund → refunded, partial → re-opens dispute_window with new deadline
    - Cancellation-path refunds subtract securityDepositHeld before touching custody; zero service refund converts to a cancellation_fee dispute window retaining the whole held amount
    - Amounts non-negative (refunded/retained/held)
    - markDisputed only inside an open window (dispute_until > now())
  - Đang enforce tại:
    - infrastructure/repositories/prisma-settlement.repository.ts:106-117 (upsert by bookingId) + prisma/migrations/20260719000000_booking_settlements/migration.sql:35-36 (UNIQUE booking_id, payment_id)
    - prisma-settlement.repository.ts:99-104 (succeeded check + deposit carve-out computed in repo)
    - application/use-cases/start-settlement-window.use-case.ts:44-57 (status guard + on-site mismatch 409) and prisma-settlement.repository.ts:180-181 (WHERE status='held')
    - application/use-cases/start-no-show-settlement-window.use-case.ts:40-60 (base = onlineHeldAmount)
    - prisma-settlement.repository.ts:271-273 (markReleased WHERE status AND dispute_until<=now()) + application/use-cases/release-settlement.use-case.ts:40,49-56 (status guard + hasRevenueJournal) + domain/ledger-journal.ts:95-114
    - application/use-cases/prepare-settlement-refund.use-case.ts:29-46 + prisma-settlement.repository.ts:191-199 (WHERE status IN, LEAST/GREATEST clamping in SQL)
    - application/use-cases/finalize-settlement-refund.use-case.ts:27-35 (refundId idempotency + cumulative math) + prisma-settlement.repository.ts:210-228 (status CASE in SQL)
    - application/use-cases/prepare-settlement-refund.use-case.ts:32-35,48-65 + finalize-settlement-refund.use-case.ts:28-29 (deposit subtraction duplicated)
    - prisma/migrations/20260719000000_booking_settlements/migration.sql:37 + 20260719120000_finance_lifecycle_hardening/migration.sql:25-27 (CHECK constraints)
    - prisma-settlement.repository.ts:232-239 (markDisputed WHERE dispute_until > now())
- **Payout** — Manual payout run to one payee (partner|affiliate): amount, period window, status pending → processing → paid | failed, transfer evidence, plus its PayoutAllocation children linking partner payouts to released settlements
  - Invariants:
    - Amount = matured available payable (maturePayable − outstanding pending/processing runs); rejected when 0 (NOTHING_TO_PAY) or below policy minAmount (BELOW_MINIMUM)
    - Per-payee serialization: no two concurrent runs can claim the same payable
    - Partner payout must be 100% backed by allocations against released settlements (FIFO by released_at), each allocation > 0, one allocation per (payout, settlement)
    - State machine: only pending→processing (claim), processing→paid (with reference evidence), pending|processing→failed; paid is idempotent, failed/paid are terminal
    - Ledger Debit-payable/Credit-cash journal written exactly when marked paid (never for pending/failed); failing releases reserved allocations
  - Đang enforce tại:
    - application/use-cases/compute-payout-payable.use-case.ts:65-74 + create-payout.use-case.ts:41-50
    - infrastructure/repositories/prisma-payout.repository.ts:37-40 (pg_advisory_xact_lock) called from create-payout.use-case.ts:38
    - create-payout.use-case.ts:66-87 (allocated !== amount → 409 rollback) + prisma-payout.repository.ts:141-173 (FIFO SQL) + prisma/migrations/20260719120000_finance_lifecycle_hardening/migration.sql:113-114 (UNIQUE + amount>0 CHECK)
    - prisma-payout.repository.ts:91-97,104-111,114-120 (guarded UPDATE WHERE status=...) + mark-payout-paid.use-case.ts:45-59 + fail-payout.use-case.ts:26-28
    - mark-payout-paid.use-case.ts:62-83 (journal + markAllocationsPaid) + fail-payout.use-case.ts:37 (releaseAllocations)
- **SettlementDispute** — Customer claim against a settlement: reason/evidence, single partner response, status open → accepted|rejected with resolution (release/full_refund/partial_refund), refundAmount, resolver audit fields
  - Invariants:
    - Openable only by the booking's customer, only while the settlement is inside an open dispute window; opening flips settlement to disputed
    - One dispute review per settlement lifetime (an existing resolved dispute blocks a new one; an open one is returned idempotently)
    - At most one partner response, only while open, only by the settlement's partner
    - Resolve only from open; refund amount must be > 0 and <= remaining held; partial_refund must be strictly less than remaining (else use full_refund); release resolution re-arms the settlement for immediate release
    - refund_amount >= 0 at the DB
  - Đang enforce tại:
    - application/use-cases/open-settlement-dispute.use-case.ts:45-75 + prisma-settlement.repository.ts:232-239 (markDisputed CAS)
    - open-settlement-dispute.use-case.ts:60-67 (no DB constraint — app-only rule)
    - infrastructure/repositories/prisma-settlement-dispute.repository.ts:127-138 (respond UPDATE WHERE open AND partner_response IS NULL AND bs.partner_id matches)
    - application/use-cases/resolve-settlement-dispute.use-case.ts:47,51-58,80-96 + prisma-settlement-dispute.repository.ts:107-117 (resolve WHERE status='open') + prisma-settlement.repository.ts:242-251 (resolveDisputeForRelease)
    - prisma/migrations/20260719120000_finance_lifecycle_hardening/migration.sql:87 (CHECK refund_amount >= 0)
- **CommissionRule** — Tenant commission configuration (appliesTo target, tenant/affiliate rate type+value, platform-admin-only platformRate, effectiveFrom/To); rule-set resolution + immutable per-booking snapshot already live in domain/
  - Invariants:
    - Tenant-share floor: platform% + affiliate% <= tenant% (fully-percent rules, non-house partners) on create, update, and platform-rate change
    - No rule (current or future timeline) may push a non-house listing's effective commission% above its deposit%
    - tenant_default rule cannot be deleted (a booking must always resolve a rate)
    - platformRate is platform-admin-only; a new rule inherits it from the tenant default, tenant update paths cannot touch it
    - Booking-time resolution follows precedence and effective window, frozen into a snapshot that later rule changes never affect
  - Đang enforce tại:
    - domain/commission-rate-guard.ts:39-46 invoked from create-commission-rule.use-case.ts:36-51, update-commission-rule.use-case.ts:43-60, set-platform-rate.use-case.ts:26-41
    - infrastructure/repositories/prisma-commission-rule.repository.ts:58-121 (timeline SQL, duplicates domain precedence at :96-104) invoked from create-commission-rule.use-case.ts:66-74 and update-commission-rule.use-case.ts:89-97
    - application/use-cases/delete-commission-rule.use-case.ts:20-22
    - create-commission-rule.use-case.ts:29-30 (inherit platformRate) + update-commission-rule.use-case.ts:72 (platformRate: found.platformRate) + port split create/update vs setPlatformRate (commission-rule-repository.port.ts:47-49)
    - domain/commission-rule-precedence.ts:63-78 + application/use-cases/resolve-commission.use-case.ts:37-59 (exported to booking module)
- **LedgerJournal** — Append-only balanced double-entry journal (value-object-like aggregate): legs with owner refs, entry types, booking/payment/payout refs, availableAt maturity; accounts are per-(tenant, ownerType, ownerId) singletons
  - Invariants:
    - sum(debit) === sum(credit) per journal (tenant-revenue leg is the balancing residual)
    - Ledger entries are immutable (no UPDATE/DELETE)
    - Exactly one active revenue journal per booking; clawback reverses only the active journal's non-payout legs and never a released re-cycle
    - Payable matures only after availableAt (DB clock); payout/clawback entries always count
    - One ledger account per (tenant, ownerType, ownerId)
  - Đang enforce tại:
    - domain/ledger-journal.ts:127-139 (residual) + prisma/migrations/20260709000001_rls_domain_and_constraints/migration.sql:111-129 (deferred ledger_journal_balance_check constraint trigger)
    - prisma/migrations/20260709000001_rls_domain_and_constraints/migration.sql:104 (ledger_entries_no_mutation trigger)
    - domain/ledger-journal.ts:95-114 + application/use-cases/release-settlement.use-case.ts:49-56 + record-clawback-journal.use-case.ts:34-52
    - infrastructure/repositories/prisma-ledger.repository.ts:224-245 (maturePayable SQL on now()) + migrations/20260719120000:30-33 (available_at column/index)
    - prisma-ledger.repository.ts:248-266 (ensureAccount race-safe upsert on P2002)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- start-settlement-window.use-case.ts:44-57 — settlement status check + expected-onsite computation + ONSITE_AMOUNT_MISMATCH rule inline in use-case
- start-settlement-window.use-case.ts:59-77 — ReleaseAmounts derivation (partnerBasis, tenantCommissionGross house-vs-non-house, partnerPayable = share − onsite) computed inline
- start-no-show-settlement-window.use-case.ts:40-60 — status check + no-show commission base choice (deposit excluded) + a second inline copy of the ReleaseAmounts math
- release-settlement.use-case.ts:94-124 — third copy of the split/ReleaseAmounts fragment (partnerBasis/tenantCommissionGross/partnerPayable at :109-116 duplicates start-settlement-window.use-case.ts:67-74), plus refund-adjusted effectiveTotal/effectiveFinal math
- release-settlement.use-case.ts:40,58-92 — status branching and the cancellation_fee release path (retained = retainedAmount || onlineHeldAmount) in the use-case
- prepare-settlement-refund.use-case.ts:29 — terminal-status business branching via ['released','refunded'].includes(...)
- prepare-settlement-refund.use-case.ts:32-46 — security-deposit carve-out rule + incremental/cumulative refund-target computation + refund_pending idempotency rule
- prepare-settlement-refund.use-case.ts:48-65 — zero-service-refund → convert to cancellation_fee window retaining the full held amount (business decision in use-case)
- finalize-settlement-refund.use-case.ts:27-35 — refundId idempotency guard + reason/status-dependent cumulative refund arithmetic
- resolve-settlement-dispute.use-case.ts:80-96 — refund bounds validation (positive, <= remaining held, partial-must-be-partial) inline
- open-settlement-dispute.use-case.ts:60-67 — one-dispute-review-per-settlement rule lives only here (no DB constraint)
- mark-payout-paid.use-case.ts:45-52 and fail-payout.use-case.ts:26-28 — payout terminal-state branching (paid idempotent vs PAYOUT_SETTLED error) duplicated across two use-cases
- create-payout.use-case.ts:41-50,53-56,74-87 — eligibility gating, cycle→period derivation, and the allocations-must-equal-amount invariant orchestrated inline
- get-payout-policy.use-case.ts:24-36 — payout policy normalization/clamping (holdingDays 0-90 default 3, minAmount, cycle) is domain logic in a use-case
- create-commission-rule.use-case.ts:29-35 and update-commission-rule.use-case.ts:38-60 — platformRate inheritance, house-partner resolution, and merge-then-revalidate logic re-implemented per use-case
- prisma-settlement.repository.ts:99-104 — securityDepositHeld/onlineHeldAmount split (business math) computed inside the repository
- prisma-settlement.repository.ts:174-178,195-196,212-228 — retained/refunded clamping (LEAST/GREATEST) and the refunded-vs-reopen-window status decision encoded as SQL CASE expressions in the repository
- prisma-settlement.repository.ts:50-84 — payoutPendingAmount/paidAmount/remainingPayableAmount business rollups computed in the repo record mapper (also re-derived in summarize() SQL :344-414)
- prisma-payout.repository.ts:141-173 — FIFO allocation algorithm (oldest released settlement first, partial fills) is pure business policy living in the repository
- prisma-commission-rule.repository.ts:96-104 — commission precedence ranking duplicated in SQL, must stay in lockstep with domain/commission-rule-precedence.ts:31-36
- prisma-settlement-dispute.repository.ts:127-138 — respond authorization + single-response rule expressed only as an UPDATE WHERE clause
- booking-finance-view.ts:52 — 'fundedBy only counts when a discount was applied' rule buried in the application-layer loader

**Port hiện tại:** Six symbol-token ports taking PrismaTx as first arg (repository-takes-tx preserved everywhere). Data is modeled as flat record interfaces over primitives (string ids, bigint VND, Date, Prisma enums) — no domain types beyond CommissionSnapshot/JournalLeg. SettlementRecord and SettlementDisputeRecord are FAT read records: write state fused with denormalized presentation fields (bookingCode, listingTitle, customerName, partnerName, tenantName) and computed rollups (payoutPendingAmount, paidAmount, remainingPayableAmount, latestPayout*). LedgerEntryRecord vs LedgerEntryView is the one place a pure write record is already separated from the read projection. There is no generic applyTransition/save-aggregate method; instead each transition is its own compare-and-swap repo method whose guard is a raw-SQL UPDATE ... WHERE status = X (startDisputeWindow, prepareRefund, finalizeRefund, markDisputed, resolveDisputeForRelease, markReleased on settlements; claimForPayment/markPaid/markFailed on payouts; resolve/respond on disputes) returning record-or-null / boolean — i.e. transition invariants live in repo WHERE clauses and SQL CASE expressions, plus DB now() comparisons, not in domain code. CommissionRule port is CRUD-shaped with a create/update data split that encodes the platformRate-is-admin-only rule structurally (update lacks platformRate; setPlatformRate is separate). Payout port exposes an advisory-lock primitive (lockPayee) and allocation sub-entity methods.

**Outbox:** produces: settlement.dispute_opened (open-settlement-dispute.use-case.ts:86), settlement.dispute_responded (respond-settlement-dispute.use-case.ts:45), settlement.dispute_resolved (resolve-settlement-dispute.use-case.ts:74,121), settlement.release_requested (resolve-settlement-dispute.use-case.ts:69), settlement.refund_requested (resolve-settlement-dispute.use-case.ts:112 — consumed by payments), payout.paid (mark-payout-paid.use-case.ts:95) · consumes: payment.succeeded → RecordHeldSettlementUseCase (finance.module.ts:147), booking.completed → StartSettlementWindowUseCase (finance.module.ts:151), booking.no_show → StartNoShowSettlementWindowUseCase (finance.module.ts:161), booking.cancelled → PrepareSettlementRefundUseCase (finance.module.ts:164), refund.requested → PrepareSettlementRefundUseCase (finance.module.ts:173), refund.completed → FinalizeSettlementRefundUseCase + RecordClawbackJournalUseCase (finance.module.ts:189), booking.refunded → RecordClawbackJournalUseCase (finance.module.ts:207), settlement.release_requested → ReleaseSettlementUseCase (self-consumed, finance.module.ts:210)

**Rủi ro refactor:**
- DB-clock coupling: every settlement transition compares against SQL now() (markDisputed dispute_until > now(), markReleased dispute_until <= now(), startDisputeWindow now()+holdingDays — prisma-settlement.repository.ts:161-277) and maturePayable uses a db_clock CTE (prisma-ledger.repository.ts:229-241). An aggregate that decides transitions from an in-memory Date.now() breaks the project's DB-clock rule and races the 30s release worker; aggregates must receive the DB now via TenantDbService.databaseNow(tx) as rehydrate/method input.
- Outbox at-least-once idempotency is currently distributed across upserts (createHeldFromPayment :106-117), CAS WHERE clauses, refundId equality (finalize-settlement-refund :27), refund_pending short-circuit (prepare-settlement-refund :40), hasRevenueJournal (release-settlement :49-56), and event-order recovery ensureHeldForBooking (:121-138). The no-throw boolean-transition style must reproduce ALL of these; the handlers also throw ConflictException/NotFoundException today, which the relay retries with backoff — converting throws to silent false returns changes retry semantics (e.g. HELD_SETTLEMENT_MISSING relies on retry to fix payment/completed ordering).
- Concurrency invariants live in SQL, not app code: lost-update safety for refunded/retained comes from LEAST/GREATEST against current row values inside guarded UPDATEs (:191-228); payout double-claim safety from pg_advisory_xact_lock + outstandingForPayee (prisma-payout.repository.ts:37-40, create-payout :38); allocation FIFO reads-then-inserts inside the same tx. Recomputing these in an aggregate from a stale read reintroduces races unless persistence stays compare-and-swap (optimistic WHERE status = expected).
- Ledger DB triggers are load-bearing: the deferred ledger_journal_balance_check and ledger_entries_no_mutation triggers (migrations/20260709000001:104-129) validate whole journals at commit — recordJournal's per-leg inserts must stay within one forTenant tx, and the tenant-residual balancing in domain/ledger-journal.ts must not be 'simplified' away.
- RLS split: tenant repos rely on the RLS-scoped tx with NO tenant_id where-clauses (e.g. commissionRule.findMany, settlement list), while findDue/listPlatform/GetPlatformFinance deliberately use prisma.admin (BYPASSRLS) (prisma-settlement.repository.ts:302-332, get-platform-finance.use-case.ts). Moving queries between aggregate-load helpers can silently cross that boundary in either direction.
- bigint/JSON serialization: money is bigint VND end-to-end; outbox payloads stringify amounts (mark-payout-paid :100, resolve-settlement-dispute :115), CommissionSnapshot stores rates as strings, additional_charges parses a JSON array (booking-finance-view.ts:68-78). Aggregate state types must keep exact string round-trips or webhook/handler payloads corrupt.
- Fat-record split risk: SettlementRecord/SettlementDisputeRecord feed a 350-line finance.mapper.ts, 5 controllers, and dashboard contracts; splitting into narrow write-state + separate read views touches all 32 endpoints' response shapes if not kept read-compatible.
- Cross-module tx sharing: ResolveCommissionUseCase is exported and executed inside the booking module's forTenant tx (finance.module.ts:123, resolve-commission.use-case.ts), and booking-finance-view.ts/is-house-partner.ts read booking/partner tables directly on the shared tx — the aggregate refactor must not force these onto their own transactions.
- Duplicated precedence logic: commission precedence exists in domain TS (commission-rule-precedence.ts:31-36) and again in the deposit-coverage SQL (prisma-commission-rule.repository.ts:96-104); the timeline-boundary check (:70-79) has no TS twin, so moving the invariant into the aggregate either keeps a SQL shadow or requires loading all rules+listings.
- No GiST reliance in this module (that is booking's exclusion constraint), but the settlement-release BullMQ worker (infrastructure/settlement-release.worker.ts) and outbox relay both drive the same ReleaseSettlementUseCase — release idempotency must survive both entry points concurrently.
- Latent gap to preserve/fix knowingly: SetPlatformRateUseCase is provider-registered but wired to no HTTP route (only finance.module.ts:25,89 reference it), and the single-dispute-per-settlement rule has no DB backstop — easy to lose or accidentally 'fix' during the refactor.

### administrative-division — effort S (3 use-cases, 2 endpoints)

**domain/ hiện tại:**
- apps/api/src/modules/administrative-division/domain/ports/administrative-division-repository.port.ts — the ONLY domain file: ADMINISTRATIVE_DIVISION_REPOSITORY symbol, IAdministrativeDivisionRepository (3 read methods), and the ResolvedAdministrativeAddress record type ({province, ward}); no entities/, no domain logic, no value objects

**Aggregate sau refactor:**
- **AdministrativeAddress (immutable value object — this module needs no mutable aggregate root; Province/Ward are seed-managed catalog rows with no runtime lifecycle)** — A validated (province, ward) pair used as the canonical location value by partner and listing modules. Owns province {code,name,type} + ward {code,provinceCode,name,type}. Construction should move to a static create/resolve factory that takes the two catalog records and enforces membership, replacing the null-check in the resolve use-case. No state transitions, no events, no writes.
  - Invariants:
    - Ward must belong to the given province (ward.provinceCode === province.code)
    - Both codes must reference existing catalog rows (province char(2), ward char(5))
    - Province cannot be deleted while wards reference it
  - Đang enforce tại:
    - apps/api/src/modules/administrative-division/infrastructure/repositories/prisma-administrative-division.repository.ts:32-33 (findFirst where { code: wardCode, provinceCode } — membership encoded as a where-clause)
    - apps/api/src/modules/administrative-division/application/use-cases/resolve-administrative-address.use-case.ts:16-24 (null result → 400 INVALID_ADMINISTRATIVE_DIVISION)
    - apps/api/prisma/schema.prisma:621 (FK administrative_wards.province_code → administrative_provinces.code, onDelete: Restrict; migration apps/api/prisma/migrations/20260715000000_administrative_divisions/migration.sql)

**Triệu chứng anemic (rule đang nằm sai tầng):**
- apps/api/src/modules/administrative-division/application/use-cases/resolve-administrative-address.use-case.ts:17-23 — the module's single business rule (ward-belongs-to-province) is expressed as a repo-result null-check throwing an HTTP BadRequestException in the application layer instead of a domain factory/invariant
- apps/api/src/modules/administrative-division/infrastructure/repositories/prisma-administrative-division.repository.ts:33 — the same membership rule is duplicated as the Prisma where-clause { code: wardCode, provinceCode }, so the rule lives half in infrastructure, half in the use-case; nothing exists in domain/
- (no other symptoms — ListProvincesUseCase and ListWardsUseCase are pure read pass-throughs, which is fine)

**Port hiện tại:** IAdministrativeDivisionRepository: 3 read-only methods (listProvinces(), listWards(provinceCode), findWardInProvince(provinceCode, wardCode)) taking primitive string codes and returning @booking/contracts zod-inferred read records (AdministrativeProvince {code,name,type}, AdministrativeWard {code,provinceCode,name,type}) plus the composed ResolvedAdministrativeAddress record. No write methods, no applyTransition-style methods, no narrow write-state types. Notably the port/repo takes NO PrismaTx — PrismaAdministrativeDivisionRepository injects PrismaService and queries the global prisma.app pool directly (prisma-administrative-division.repository.ts:11,14,21,32), which is correct here: the tables are global reference data with no tenant_id and no RLS policy.

**Outbox:** produces: (none) · consumes: (none)

**Rủi ro refactor:**
- Cross-module blast radius: ResolveAdministrativeAddressUseCase is exported (administrative-division.module.ts:20) and injected by 5 external use-cases — partner/apply-as-partner.use-case.ts:38, listing/create-listing.use-case.ts:57, listing/update-listing.use-case.ts:44, listing/create-listing-group.use-case.ts:28, listing/update-listing-group.use-case.ts:28. Changing its signature, return record, or the 400 INVALID_ADMINISTRATIVE_DIVISION error envelope ripples across 3 modules plus frontend error handling.
- Transaction placement: callers deliberately resolve the address BEFORE opening forTenant (e.g. listing/create-listing.use-case.ts:64-68); a mechanical 'repository-takes-tx' normalization would either force this global-catalog query into the tenant RLS tx (tables have no RLS policy and live outside tenant scope) or break one-tx-per-operation. Keep this repo tx-less as an explicit exception.
- HTTP caching: both public endpoints set Cache-Control: public, max-age=86400 (public-administrative-division.controller.ts:23,32) — any response-shape change is cached client-side for a day.
- Catalog is seed/migration-owned (apps/api/prisma/seed-administrative-divisions.ts, migrations/20260715000000_administrative_divisions) and rows carry effective_from dates (schema.prisma:601,617), hinting at future temporal versioning of the 2025 VN merger reform — an aggregate hard-coding a single 'current' catalog could conflict with that.
- Not applicable here (no risk): outbox idempotency, DB-clock usage, GiST exclusion, ledger triggers, bigint serialization — the module touches none of them.
