# DATA-001 — Registration completion consistency

**Status:** proposed  
**Date:** 2026-08-20  
**Scope:** customer registration completion in `identity-access`, including legal-consent outbox production  
**Severity:** P1 data integrity

## Context

The verified registration flow currently spans Redis and PostgreSQL with three separate durability boundaries:

1. `RedisAuthChallengeStore.consumeCompletion()` uses Redis `GETDEL`, so the completion token is destroyed before durable registration work begins.
2. `PrismaUserRepository.create()` inserts the global `users` row through the admin pool with no surrounding transaction owned by the registration use case.
3. When registration is tenant-scoped, `CompleteRegistrationUseCase` then opens a separate tenant transaction and emits `user.registration_consent` into `outbox_events`.

That ordering creates a permanent partial-state failure mode. If user creation succeeds but the tenant outbox transaction fails, the completion request fails after the token has already been consumed. The user now exists, a retry cannot use the same completion token, and starting registration again rejects the email as already taken. The legal-consent proof may therefore be missing for an otherwise successfully created account.

ADR 0003 establishes the stronger invariant that a state change and its inter-module write-path side effect must commit or roll back together through the transactional outbox. The current registration path cannot satisfy that invariant because the global user insert and the consent outbox row are committed separately.

ADR 0008 also requires customer registration consent to cross from `identity-access` to `legal` through the `user.registration_consent` outbox event because a direct `identity-access -> legal` write would create a forbidden module cycle. The solution must preserve that boundary.

## Goals

The registration completion flow must become recoverable and idempotent across Redis, PostgreSQL, process crashes, and concurrent retries.

The implementation must guarantee these properties:

- A tenant-scoped registration never leaves a committed user without a committed `user.registration_consent` outbox event because of an in-request database failure.
- A database or outbox failure does not consume the completion token, so the caller can retry the same request.
- A process crash after the database transaction commits but before Redis token cleanup does not strand the caller or create a duplicate account.
- Two concurrent completion requests for the same verified registration cannot create two accounts or turn a conflicting account into a false success.
- Retry reconciliation never overwrites an existing account password.
- Existing password-reset completion semantics remain unchanged.
- The legal module remains decoupled from `identity-access`; consent continues to cross the boundary through the outbox.
- No automated test framework or `*.test` / `*.spec` artifacts are introduced, in accordance with ADR 0005.

## Non-goals

This change does not redesign OTP issuance, registration start/resend/verify UX, session creation, email verification rules, legal document versioning, or the outbox relay.

It does not introduce a durable `registration_attempts` table or a distributed transaction between Redis and PostgreSQL.

It does not make external effects exactly-once. The design deliberately relies on the current at-least-once outbox contract and the registration-consent handler's tolerance for duplicate acceptance rows.

Password-reset completion remains destructive-token-first unless separately audited; DATA-001 is scoped to customer registration.

## Considered approaches

### 1. Put user creation and outbox emit in one database transaction only

This fixes the user-without-outbox state but leaves the completion token destructively consumed before the transaction. Any database failure would still force the user to restart OTP verification, and a crash timing window would remain awkward.

Rejected because it fixes only half of the recoverability problem.

### 2. Non-destructive token read, atomic registration persistence, consume after durable success

Read the completion payload without deleting it, perform user creation plus consent outbox emission in one admin-pool PostgreSQL transaction, reconcile safe retries, then delete the completion token only after durable success.

Chosen because it closes the confirmed partial-state bug without adding a schema or changing module boundaries.

### 3. Durable registration-attempt state machine in PostgreSQL

Persist a registration attempt with explicit pending/completed states and let Redis become only an OTP transport/cache.

This offers the strongest auditability and state-machine semantics, but it requires a new schema, migration, cleanup policy, and broader auth-flow redesign. It is unnecessary for the current bug.

Rejected as disproportionate for DATA-001.

## Decision

Adopt approach 2.

The completion token becomes a recoverable authorization capability during the completion window rather than a one-shot trigger destroyed before work begins.

The durable commit boundary becomes one admin-pool PostgreSQL transaction containing:

- global `User` creation; and
- `user.registration_consent` outbox insertion when the verified payload carries tenant consent.

Only after that durable step succeeds does the use case consume the Redis completion token.

If durable state already exists because a prior request committed but failed before token cleanup, the use case reconciles the retry instead of rejecting the email blindly.

## Architecture

### Auth challenge store

Extend `IAuthChallengeStore` with a non-destructive completion read for registration completion. The exact name may be `peekCompletion()` or equivalent, but its contract must be explicit:

```ts
peekCompletion(
  completionToken: string,
  purpose: AuthChallengePurpose,
): Promise<AuthChallengePayload | null>;
```

`RedisAuthChallengeStore` implements this with `GET` against the hashed completion key. It validates the stored payload purpose before returning it.

`consumeCompletion()` remains available and continues to use `GETDEL`. Password-reset completion continues to call it exactly as before.

Registration completion uses `peekCompletion()` first and calls `consumeCompletion()` only after durable completion or successful reconciliation.

The token TTL remains the existing `COMPLETION_TTL_SEC`; no new Redis keys are introduced.

### Registration completion persistence port

Introduce an identity-access-owned port dedicated to the durable registration boundary. The use case must not reach into Prisma directly.

Representative shape:

```ts
export const REGISTRATION_COMPLETION_REPOSITORY = Symbol('REGISTRATION_COMPLETION_REPOSITORY');

export interface RegistrationCompletionInput {
  user: NewUserAccount;
  consent?: {
    tenantId: string;
    acceptedVersionIds: readonly string[];
    acceptedLocale: Locale;
    ip: string | null;
  };
}

export interface IRegistrationCompletionRepository {
  create(input: RegistrationCompletionInput): Promise<UserRecord>;
}
```

The exact type names may follow existing repository naming conventions, but the responsibility is fixed: atomically create the user and, when supplied, the consent outbox row.

### Prisma adapter

Add a Prisma adapter in `identity-access/infrastructure/repositories` backed by `PrismaService.admin.$transaction()`.

Within that transaction:

1. create the global `users` row;
2. if consent is present, call `OutboxService.emit(tx, ...)` with `eventType: 'user.registration_consent'`, `tenantId`, and the same payload currently emitted by `CompleteRegistrationUseCase`;
3. return the created user record.

Using the admin transaction is intentional:

- `users` is global and already belongs on the BYPASSRLS admin pool;
- `outbox_events` can carry `tenant_id` as event routing metadata without requiring the producer to enter a tenant-scoped application transaction;
- `OutboxService.emit()` only requires a Prisma transaction client;
- the outbox relay later restores the event's tenant context for the legal handler;
- this preserves one PostgreSQL transaction across the actual state change and its inter-module side effect.

The adapter must not import legal infrastructure or call legal application code.

### CompleteRegistrationUseCase

The use case becomes an orchestration layer with this sequence:

1. Non-destructively read the registration completion payload.
2. Reject expired/missing/wrong-purpose payload exactly as today.
3. Require `fullName` as today.
4. Look up the email.
5. If no user exists:
   - hash the submitted password;
   - build `UserAccount.register(...)`;
   - call the registration-completion repository to atomically create user + consent outbox event;
   - if a unique-email race occurs, enter retry reconciliation instead of immediately surfacing a generic failure.
6. If a user already exists, or the create lost a unique race, run retry reconciliation.
7. After durable creation or successful reconciliation, consume the same completion token.
8. Return `{ success: true }`.

A failed durable create must leave the token untouched.

## Retry reconciliation

An existing account is not automatically proof that the same registration completed earlier. Reconciliation must be conservative.

Treat an existing account as the completed result of this registration only when all of the following are true:

- the account email matches the verified payload through the existing case-insensitive database uniqueness semantics;
- `emailVerifiedAt` is non-null;
- `passwordHash` is non-null;
- `IPasswordHasher.verify(existing.passwordHash, input.password)` succeeds.

If any condition fails, preserve the existing `EmailTaken` behavior. In particular, never replace the existing password with the submitted one as part of reconciliation.

The verified password match is the possession proof that the retry belongs to the account created by the earlier successful attempt. It also protects the crash-recovery path from turning an unrelated pre-existing account into success.

### Consent during reconciliation

If the payload is not tenant-scoped, reconciliation can consume the token immediately after the account match.

If the payload includes `tenantId` and accepted versions, reconciliation must ensure a `user.registration_consent` event exists before consuming the token.

Because the previous request may have committed both user and event atomically, and the process may simply have crashed before Redis cleanup, the simplest safe recovery is to emit another registration-consent outbox event in a tenant-tagged admin transaction before consuming the token.

Duplicate events are acceptable under the existing at-least-once design: `RecordRegistrationConsentUseCase` explicitly tolerates redelivery, and duplicate acceptance rows are permitted by ADR 0008/D9.

This avoids needing a new outbox dedupe schema or querying another module for legal acceptance state.

## Concurrency semantics

### Two requests start before user creation

Both can peek the same token and both can observe no existing user.

The database email uniqueness constraint is the final arbiter. One transaction creates the user and event. The other receives a unique-email conflict, re-reads the account, verifies the submitted password against the committed hash, emits the recovery consent event when required, then treats the request as an idempotent success.

Neither request overwrites account state.

### One request consumes the token while another is still running

Token consumption is intentionally after durable work. A concurrent request that already peeked the payload can continue. If it reaches reconciliation after the first commit, it validates the existing account as above.

The final `consumeCompletion()` call may return null because another request already deleted the key. That must not convert a durable success into an error. Once this request has independently proved durable completion/reconciliation from the payload it legitimately peeked while the token was valid, token deletion is cleanup rather than the commit decision.

The use case should still call `consumeCompletion()` best-effort and not re-open the flow if the key is already gone.

### Completion token expires during database work

A request that successfully peeked a valid completion payload may finish after Redis TTL expiry. Durable registration still succeeds. Token cleanup may find nothing; the response remains success because authorization was established at the start of the request.

## Crash/failure matrix

| Failure point | Required result |
| --- | --- |
| Before completion payload read | No state change; normal expiry/error behavior |
| After payload read, before DB transaction | Token remains; safe retry |
| User insert fails | Transaction rolls back; no outbox row; token remains |
| Outbox insert fails | User insert rolls back in same transaction; token remains |
| DB commit succeeds, process crashes before token consume | User + event durable; token remains until TTL; retry reconciles to success |
| Token consume succeeds, response is lost | Client retry with same token gets expired; durable registration is already correct. A fresh login is the recovery path; this is not a partial-state bug |
| Two concurrent creates | One wins uniqueness; loser reconciles only after password verification |
| Existing unrelated account | `EmailTaken`; no password overwrite; no false success |

The response-loss-after-token-consume case is acceptable because the account and consent event are already durable. DATA-001 is concerned with preventing failed durable registration from becoming unrecoverable, not guaranteeing an HTTP response exactly once.

## Error handling

Continue using the current auth challenge expiry error for missing/invalid completion payloads.

Continue using `EmailTaken` when an existing account cannot be proven to be the same completed registration.

A Prisma unique-email conflict during create is not exposed immediately; it triggers one reconciliation read. If reconciliation fails, surface `EmailTaken`.

Unexpected database, Redis, Argon2, or outbox errors propagate normally. Critically, database-side errors occur before token consumption.

If final Redis token cleanup fails after durable registration succeeds, the API should still return success. The remaining token is bounded by TTL and any retry must still pass account/password reconciliation. Token cleanup failure should be logged by the existing application logging path if available; this change should not add a new logging subsystem.

## Module boundaries

The design preserves the existing DAG:

- `identity-access` owns the orchestration and persistence port;
- its Prisma adapter may depend on shared `PrismaService` and shared `OutboxService`;
- no `identity-access -> legal` application/infrastructure import is introduced;
- legal continues to consume `user.registration_consent` through its registered outbox handler;
- no `forwardRef()` is permitted.

`pnpm check:module-cycles` remains a mandatory verification gate.

## Expected code changes

Likely files:

- `apps/api/src/modules/identity-access/domain/ports/auth-challenge-store.port.ts`
- `apps/api/src/modules/identity-access/infrastructure/services/redis-auth-challenge.store.ts`
- `apps/api/src/modules/identity-access/application/use-cases/complete-registration.use-case.ts`
- new identity-access registration-completion persistence port
- new Prisma registration-completion repository/adapter
- `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts`

`PrismaUserRepository` remains the general user repository. Registration atomicity is deliberately isolated behind the new completion-specific port instead of changing every user create call site.

No Prisma schema migration is expected.

## Verification strategy

ADR 0005 forbids introducing automated test files or a test runner, so verification uses the repository's accepted static checks plus focused runtime smoke against a disposable real database/Redis environment.

### Static verification

Run the repository-prescribed checks, at minimum:

- `pnpm check:no-tests`
- `pnpm check:module-cycles`
- API typecheck
- repository lint/build steps exercised by CI
- `pnpm --filter=@booking/api check:rls`

### Focused runtime smoke

Use disposable data and record exact evidence for each case:

1. **Outbox failure rollback** — force the outbox insert to fail inside the transaction; confirm no user row commits and the same completion token remains usable.
2. **Retry after failed transaction** — restore DB behavior and repeat the same completion request; confirm one user and one durable consent event are created.
3. **Crash-after-commit simulation** — complete the DB transaction but intentionally skip token cleanup; repeat completion with the same token and password; confirm success without a second user and with acceptable at-least-once consent events.
4. **Concurrent completion** — issue two completion requests with the same token/password concurrently; confirm one user, no password overwrite, and both requests resolve consistently according to the reconciliation contract.
5. **Conflicting existing account** — create an account with the same email but a different password; confirm completion returns `EmailTaken` and does not mutate the password or emit consent for that account.
6. **Non-tenant registration** — confirm account creation succeeds without a consent event and retry reconciliation still works.
7. **Password reset regression** — confirm password-reset completion still consumes its token destructively and retains current behavior.
8. **Legal delivery** — allow the outbox relay to process the event and confirm the registration acceptance is ultimately recorded for the expected tenant/version/locale.

No claim of full correctness is made until the runtime cases that require PostgreSQL/Redis have actually been executed.

## Acceptance criteria

DATA-001 is complete when:

- the registration completion payload is read non-destructively before durable work;
- user creation and registration-consent outbox insertion share one PostgreSQL transaction;
- failed durable work leaves the completion token retryable;
- post-commit retry is idempotently reconciled using verified account/password evidence;
- concurrent completion cannot create duplicate users or overwrite credentials;
- unrelated existing accounts still fail as `EmailTaken`;
- token cleanup occurs only after durable success/reconciliation and cleanup absence does not undo durable success;
- password-reset completion behavior is unchanged;
- module-cycle and no-tests policies remain satisfied;
- static CI passes; and
- focused real DB/Redis smoke evidence is recorded before merge.

## Rollout and operational notes

No backfill is required for normal accounts.

Existing users that were already stranded by the old partial-state bug cannot be distinguished automatically from ordinary accounts solely from the `users` row. This change prevents new incidents; remediation of historical missing registration consent, if any exists, should be handled as a separate operational audit against legal acceptance/outbox history rather than inferred during login.

Because retry reconciliation may intentionally emit an additional consent event, operators should continue treating the registration-consent path as at-least-once. The legal handler already follows that contract.
