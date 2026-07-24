# Entity-centric final-gap hardening

**Goal:** Close the owner-approved decisions left in `docs/refactor/HANDOFF.md` after rebasing
`refactor/entity-centric` onto the latest `main`, while preserving the repository CAS rule and
making every intentional behavior/wire change explicit.

## Global constraints

- No tests (ADR 0005). Verification is lint, typecheck, build, RLS check and runtime smoke.
- Controller → use-case → repository port → repository; no application service.
- CAS stays in repositories. A domain transition computes intent; the repository guards the write
  against the persisted pre-image and reports a miss.
- Existing RLS/admin-pool boundaries, outbox payloads and transaction counts stay unchanged.
- Dynamic product JSON (listing attributes/mode config, tenant theme/settings and historical booking
  snapshots) remains intentionally open. Track B removes accidental `unknown` at HTTP/provider
  boundaries; it does not invent closed schemas for tenant-configured data.

## Approved decision matrix

| Item | Decision | Deliberate change |
|---|---|---|
| `SetPlatformRateUseCase` | Delete the unreachable slice | Removes a provider, port/repository method and unused request contract; no HTTP route existed |
| Content-report `targetType` | Keep and formalize as deprecated compatibility alias | Response contract and mapper now intentionally emit both `target` and `targetType` |
| Current subscription | One current-subscription reader | Latest `startsAt`, then `createdAt`; liveness uses the DB clock returned with the selection |
| Gateway credentials | Discriminated union by gateway | HTTP input and decrypted persistence data are provider-validated; secrets remain write-only |
| Payment JSON | Typed JSON value + validated stored checkout/evidence shapes | Historical legacy checkout payload remains readable |
| Loose HTTP boundary | Close the final raw controller query | Catalog query uses its Zod DTO at the Nest boundary |
| Listing/content-report moderation | Add repository CAS and explicit transition graphs | Concurrent loser receives a typed 409; invalid transitions no longer return 200 |

## Task 1 — Remove unreachable platform-rate command and formalize report compatibility

1. Delete `SetPlatformRateUseCase`.
2. Remove its finance module provider, commission repository port method, Prisma implementation and
   unused contracts schema/type.
3. Add `targetType` to `contentReportResponseSchema` as a deprecated alias.
4. Replace spread-based response mapping with an explicit mapper that emits exactly the contract
   fields, including both aliases.
5. Grep the workspace to prove the deleted command has no references.

## Task 2 — Consolidate current-subscription selection and time

1. Add a current-subscription reader port with a single adapter query that returns the selected row,
   resolved plan and the database evaluation time.
2. Define current as newest `starts_at DESC, created_at DESC`; assignment remains append-only and
   future-dated rows retain the existing precedence.
3. Move live subscriber counts onto that reader and evaluate every row with
   `evaluateSubscription(row, evaluatedAt)`.
4. Update current-subscription, plan-count, host-resolution, guard, tenant-detail and platform-health
   consumers to use the reader. Remove the raw-SQL and Prisma-order duplicates.
5. Make subscription-status evaluation use the reader's DB time; use that same instant for quota
   window calculations in the composed status response.

## Task 3 — Harden payment I/O types

1. Convert `upsertGatewayConfigInputSchema` to a discriminated union covering SePay, PayOS, MoMo,
   ZaloPay and mock credentials.
2. Export gateway credential types and make gateway config records/data discriminated by `gateway`.
3. Validate decrypted credential JSON in the repository before it reaches the gateway registry.
   Invalid/tampered stored credentials fail closed and never become empty secrets.
4. Replace payment `gatewayPayload: unknown` with a recursive JSON type and a typed checkout payload;
   validate checkout payloads at rehydration while retaining the legacy `{paymentUrl}` fallback.
5. Validate refund evidence JSON on rehydration and keep the existing public response.
6. Replace the remaining raw catalog query controller parameter with its Zod DTO.

## Task 4 — Add moderation state graphs and CAS

1. Content reports allow `open → reviewing → resolved|dismissed`; terminal states are immutable.
   Resolution notes stay required only for terminal targets.
2. Change content-report persistence to guarded update by expected status and return `null` on CAS
   miss; translate the miss to a typed 409 without writing audit/outbox.
3. Listing/group moderation persists with `WHERE id AND status = expectedStatus`; standalone and
   cascade callers pass the loaded status and stop on a miss.
4. Tighten hide to `pending_review|published → archived`; hiding `draft` or already `archived`
   becomes a typed domain error. Keep submit's existing pending-review idempotency.
5. Add a shared `LISTING_STATE_CHANGED` 409 for CAS losers. Audit and outbox remain after successful
   persistence only.

## Task 5 — Documentation and final review

1. Update `HANDOFF.md`, the governing spec register, conventions and architecture notes with the
   decisions, transition graphs, compatibility alias and intentional dynamic-JSON allowlist.
2. Run targeted API/contracts/dashboard typechecks while iterating.
3. Run `pnpm turbo lint typecheck build --force` with Node 24.18.0.
4. Run `pnpm --filter=@booking/api check:rls`.
5. Start the API on a non-conflicting port and smoke readiness plus the affected write/read paths
   when local infrastructure is available. Record any environment-only limitation exactly.
6. Review `origin/main...HEAD` for wire changes, direct Prisma in application, missing permission
   decorators, tests and schema/migration drift.
