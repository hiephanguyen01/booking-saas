# Entity-centric API refactor — final report

> Completed on 2026-07-25 and merged into `main` at `0f31cf5`.

## Outcome

All 16 API bounded contexts were migrated through the entity-centric refactor:

- reviews, content-reports, notification, favorites;
- promotions, affiliate, identity-access, partner;
- catalog, tenancy, listing, scheduling;
- payments, booking, finance, administrative-division.

The final inventory contains 256 `*.use-case.ts` files. Every module has `application`, `domain` and
`infrastructure` boundaries; application use-cases contain no direct Prisma model access or raw SQL,
and application/domain code does not import infrastructure.

## Conventions established

- Write-path invariants and state transitions live in framework-free entities, value objects or pure
  domain policies. Query/projection and provider-boundary orchestration are not forced into fake
  entities.
- The flow remains `controller → use-case → repository-port → repository`; one use-case per file,
  with one public `execute()` entrypoint.
- Domain transitions and repository CAS are both required. SQL guards, advisory locks, unique
  indexes and GiST constraints remain the concurrency backstop.
- Tenant work runs in one `TenantDbService.forTenant()` transaction. An empty tenant id is invalid;
  unroutable outbox events are logged and skipped rather than retried as business failures.
- Entities receive clocks and external facts as arguments. DB-sensitive transitions use the DB
  clock.
- Standard 4xx failures use named, framework-free `DomainError` classes. HTTP/provider-only shapes
  use named Nest exceptions; custom envelopes are not constructed inline.
- Shared response shapes start in `@booking/contracts`, then flow through API DTO/mapper and
  dashboard/storefront runtime parsing.
- Wire contracts remain stable: status/code/message/details, outbox payloads and event order must be
  preserved unless an explicit coordinated change is approved.

The normative rules live in [`docs/conventions.md`](../conventions.md),
[`apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md) and the
[`entity-centric design spec`](../superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md).

## Final hardening

- Removed unreachable `SetPlatformRateUseCase` and its unused contract/port/repository surface.
- Formalized deprecated content-report `targetType` as a compatibility alias.
- Consolidated “current subscription” selection behind one reader with a deterministic tiebreak and
  DB-clock semantics.
- Hardened gateway credentials and provider JSON boundaries with discriminated validation.
- Added aggregate transition graphs and repository CAS for content-report and listing/group
  moderation.
- Added CAS for booking pickup/return and kept audit/outbox writes after a successful guarded update.
- Moved repeated application errors into named module/shared definitions.
- Aligned create-tenant, submit-listing, current-subscription, content-report and webhook response
  contracts with frontend consumers.

## Verification

Final verification on the merged source tree:

- `pnpm turbo lint typecheck build --force`: **28/28 successful**, cache 0.
- `pnpm --filter=@booking/api check:rls`: **46/46** tenant-scoped tables covered.
- All migrations deployed successfully from an empty temporary database during hardening.
- Production API build booted successfully and `GET /health` returned 200.
- 249/249 controller routes had an access declaration and Swagger response declaration.
- No executable test files/config/scripts were added; verification follows ADR 0005.

## Remaining architecture debt

The refactor did not eliminate all synchronous cross-module imports. The final static graph measured:

- 229 cross-context imports total;
- 131 technical seams, primarily identity-access decorators/principal types and tenancy guards;
- 98 business-facing dependencies: 66 from application, 24 from infrastructure and 8 from domain.

Largest dependency pairs were scheduling→listing (14), affiliate→finance (8), listing→catalog (8),
booking→listing (6), booking→promotions (5) and catalog→scheduling (5).

Closing this requires a separate architecture track: move technical seams into a shared kernel,
introduce module-owned reader/command ports and migrate asynchronous effects to outbox events. It
must not be performed as a mechanical import rewrite because transaction boundaries, synchronous
queries, CAS and event ordering are involved.

Product-policy gaps intentionally retained in design-spec §8a remain separate backlog work.
