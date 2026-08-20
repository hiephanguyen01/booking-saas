# Registration Completion Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make registration completion recoverable and idempotent so user creation and registration-consent outbox production are atomic, while Redis completion-token cleanup happens only after durable success.

**Architecture:** Registration completion first reads its Redis completion payload non-destructively, then persists the global user plus optional tenant-tagged `user.registration_consent` event in one `prisma.admin` transaction behind an identity-access-owned port. Safe retries reconcile an already-created account by verified password ownership and can re-emit the consent event under the existing at-least-once contract before consuming the Redis token as cleanup.

**Tech Stack:** NestJS 11, TypeScript 5.8, Prisma 6/PostgreSQL, ioredis/Redis, Argon2, transactional outbox.

**Spec:** `docs/superpowers/specs/2026-08-20-registration-completion-consistency-design.md`

## Global Constraints

- Follow ADR 0003: inter-module write-path side effects cross module boundaries through the transactional outbox.
- Preserve the `identity-access -> legal` DAG; do not import legal application/infrastructure code and do not introduce `forwardRef()`.
- Follow ADR 0005: do not add `*.test.*`, `*.spec.*`, Jest, Vitest, Playwright, test scripts, or CI test steps.
- Preserve password-reset completion semantics: it must continue using destructive `consumeCompletion()` exactly as before.
- Do not add a Prisma schema migration or a durable registration-attempt table.
- Do not overwrite an existing user's password during retry reconciliation.
- Treat duplicate `user.registration_consent` delivery as acceptable at-least-once behavior; do not add an outbox dedupe schema for this fix.
- Never log raw passwords, OTPs, completion tokens, or password hashes.
- Keep changes scoped to DATA-001; no unrelated auth, legal, session, or outbox refactors.

---

## File Structure

**Create**

- `apps/api/src/modules/identity-access/domain/ports/registration-completion-repository.port.ts` — owns the durable registration-completion interface and result types.
- `apps/api/src/modules/identity-access/infrastructure/repositories/prisma-registration-completion.repository.ts` — implements atomic user + consent-event persistence and recovery consent emission on the admin pool.

**Modify**

- `apps/api/src/modules/identity-access/domain/ports/auth-challenge-store.port.ts` — add the non-destructive `peekCompletion()` contract.
- `apps/api/src/modules/identity-access/infrastructure/services/redis-auth-challenge.store.ts` — implement `peekCompletion()` using Redis `GET` without changing `consumeCompletion()`.
- `apps/api/src/modules/identity-access/application/use-cases/complete-registration.use-case.ts` — orchestrate durable create, retry reconciliation, cleanup, and cleanup-error logging.
- `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts` — bind the new persistence port to its Prisma adapter.

**Intentionally unchanged**

- `apps/api/src/modules/identity-access/application/use-cases/complete-password-reset.use-case.ts`
- `apps/api/src/modules/legal/application/use-cases/record-registration-consent.use-case.ts`
- `apps/api/src/shared/outbox/outbox.service.ts`
- Prisma schema and migrations.

---

### Task 1: Add non-destructive completion-token reads

**Files:**
- Modify: `apps/api/src/modules/identity-access/domain/ports/auth-challenge-store.port.ts`
- Modify: `apps/api/src/modules/identity-access/infrastructure/services/redis-auth-challenge.store.ts`

**Interfaces:**
- Consumes: existing `AuthChallengePayload`, `AuthChallengePurpose`, and completion-key hashing behavior.
- Produces:

```ts
peekCompletion(
  completionToken: string,
  purpose: AuthChallengePurpose,
): Promise<AuthChallengePayload | null>;
```

- [ ] **Step 1: Add `peekCompletion()` to `IAuthChallengeStore`.**

Insert the method immediately before `consumeCompletion()` so the interface documents the two semantics together:

```ts
peekCompletion(
  completionToken: string,
  purpose: AuthChallengePurpose,
): Promise<AuthChallengePayload | null>;
consumeCompletion(
  completionToken: string,
  purpose: AuthChallengePurpose,
): Promise<AuthChallengePayload | null>;
```

Keep every existing method and type unchanged.

- [ ] **Step 2: Implement `RedisAuthChallengeStore.peekCompletion()`.**

Place it directly above `consumeCompletion()` and reuse the existing `completionKey()` helper:

```ts
async peekCompletion(
  completionToken: string,
  purpose: AuthChallengePurpose,
): Promise<AuthChallengePayload | null> {
  const value = await this.redis.get(this.completionKey(completionToken));
  if (!value) return null;
  const payload = JSON.parse(value) as AuthChallengePayload;
  return payload.purpose === purpose ? payload : null;
}
```

Do not extend TTL and do not create a second Redis key.

- [ ] **Step 3: Verify destructive password-reset behavior was not modified.**

Confirm `consumeCompletion()` still uses:

```ts
const value = await this.redis.getdel(this.completionKey(completionToken));
```

and `CompletePasswordResetUseCase` still calls `consumeCompletion(..., 'password_reset')`.

- [ ] **Step 4: Run focused static verification.**

Run:

```bash
pnpm --filter=@booking/api typecheck
```

Expected: exit code `0`. If this fails because later consumers have not yet been updated, fix only type errors caused by this task; do not implement later orchestration early.

- [ ] **Step 5: Commit only Task 1 files.**

```bash
git add -- apps/api/src/modules/identity-access/domain/ports/auth-challenge-store.port.ts \
  apps/api/src/modules/identity-access/infrastructure/services/redis-auth-challenge.store.ts
git diff --cached --check
git diff --cached
git commit -m "fix(auth): add recoverable completion token read"
```

---

### Task 2: Introduce the atomic registration-completion persistence boundary

**Files:**
- Create: `apps/api/src/modules/identity-access/domain/ports/registration-completion-repository.port.ts`
- Create: `apps/api/src/modules/identity-access/infrastructure/repositories/prisma-registration-completion.repository.ts`

**Interfaces:**
- Consumes: `NewUserAccount`, `UserRecord`, `Locale`, `PrismaService`, `OutboxService`.
- Produces:

```ts
export const REGISTRATION_COMPLETION_REPOSITORY = Symbol('REGISTRATION_COMPLETION_REPOSITORY');

export interface RegistrationConsentEventInput {
  tenantId: string;
  userId: string;
  acceptedVersionIds: readonly string[];
  acceptedLocale: Locale;
  ip: string | null;
}

export interface RegistrationCompletionInput {
  user: NewUserAccount;
  consent?: Omit<RegistrationConsentEventInput, 'userId'>;
}

export type RegistrationCompletionCreateResult =
  | { status: 'created'; user: UserRecord }
  | { status: 'email_conflict' };

export interface IRegistrationCompletionRepository {
  create(input: RegistrationCompletionInput): Promise<RegistrationCompletionCreateResult>;
  emitConsent(input: RegistrationConsentEventInput): Promise<void>;
}
```

- [ ] **Step 1: Create the domain port exactly around the durable operation.**

Create `registration-completion-repository.port.ts` with:

```ts
import type { Locale } from '@booking/contracts';
import type { NewUserAccount } from '../entities/user-account.entity';
import type { UserRecord } from './user-repository.port';

export const REGISTRATION_COMPLETION_REPOSITORY = Symbol('REGISTRATION_COMPLETION_REPOSITORY');

export interface RegistrationConsentEventInput {
  tenantId: string;
  userId: string;
  acceptedVersionIds: readonly string[];
  acceptedLocale: Locale;
  ip: string | null;
}

export interface RegistrationCompletionInput {
  user: NewUserAccount;
  consent?: Omit<RegistrationConsentEventInput, 'userId'>;
}

export type RegistrationCompletionCreateResult =
  | { status: 'created'; user: UserRecord }
  | { status: 'email_conflict' };

export interface IRegistrationCompletionRepository {
  create(input: RegistrationCompletionInput): Promise<RegistrationCompletionCreateResult>;
  emitConsent(input: RegistrationConsentEventInput): Promise<void>;
}
```

Do not expose Prisma types through this port.

- [ ] **Step 2: Create the Prisma adapter and local user mapper.**

Start `prisma-registration-completion.repository.ts` with these dependencies:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  IRegistrationCompletionRepository,
  RegistrationCompletionCreateResult,
  RegistrationCompletionInput,
  RegistrationConsentEventInput,
} from '../../domain/ports/registration-completion-repository.port';
import type { UserRecord } from '../../domain/ports/user-repository.port';
```

Add a private file-local mapper rather than exporting internals from `PrismaUserRepository`:

```ts
function toUserRecord(row: User): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    locale: row.locale,
    status: row.status,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    emailVerifiedAt: row.emailVerifiedAt,
  };
}
```

- [ ] **Step 3: Implement a single helper for consent-event shape.**

Inside the adapter, add:

```ts
private emitConsentInTx(
  tx: Prisma.TransactionClient,
  input: RegistrationConsentEventInput,
): Promise<void> {
  return this.outbox.emit(tx, {
    tenantId: input.tenantId,
    eventType: 'user.registration_consent',
    payload: {
      userId: input.userId,
      acceptedVersionIds: [...input.acceptedVersionIds],
      acceptedLocale: input.acceptedLocale,
      ip: input.ip,
    },
  });
}
```

This keeps the event payload identical between first-time creation and retry recovery.

- [ ] **Step 4: Implement `create()` as one admin-pool transaction.**

Use this structure:

```ts
async create(input: RegistrationCompletionInput): Promise<RegistrationCompletionCreateResult> {
  try {
    return await this.prisma.admin.$transaction(async (tx) => {
      const row = await tx.user.create({ data: input.user });
      const user = toUserRecord(row);

      if (input.consent) {
        await this.emitConsentInTx(tx, {
          ...input.consent,
          userId: user.id,
        });
      }

      return { status: 'created', user } as const;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { status: 'email_conflict' };
    }
    throw error;
  }
}
```

The only translated database error is `P2002`; all other errors rethrow.

- [ ] **Step 5: Implement recovery consent emission.**

```ts
async emitConsent(input: RegistrationConsentEventInput): Promise<void> {
  await this.prisma.admin.$transaction((tx) => this.emitConsentInTx(tx, input));
}
```

Do not query legal acceptance state and do not attempt outbox deduplication.

- [ ] **Step 6: Run focused static verification.**

```bash
pnpm --filter=@booking/api typecheck
pnpm check:module-cycles
```

Expected: both exit `0`.

- [ ] **Step 7: Commit only Task 2 files.**

```bash
git add -- \
  apps/api/src/modules/identity-access/domain/ports/registration-completion-repository.port.ts \
  apps/api/src/modules/identity-access/infrastructure/repositories/prisma-registration-completion.repository.ts
git diff --cached --check
git diff --cached
git commit -m "fix(auth): make registration persistence atomic"
```

---

### Task 3: Make `CompleteRegistrationUseCase` recoverable and idempotent

**Files:**
- Modify: `apps/api/src/modules/identity-access/application/use-cases/complete-registration.use-case.ts`

**Interfaces:**
- Consumes:
  - `IAuthChallengeStore.peekCompletion()` and `consumeCompletion()` from Task 1.
  - `IRegistrationCompletionRepository.create()` and `emitConsent()` from Task 2.
  - existing `IUserRepository.findByEmail()`.
  - existing `IPasswordHasher.hash()` and `verify()`.
- Produces: unchanged `Promise<AuthFlowCompleteResponse>` API contract.

- [ ] **Step 1: Replace tenant-transaction dependencies with the new persistence port.**

Remove these imports and constructor dependencies:

```ts
OutboxService
TenantDbService
```

Add:

```ts
import { Logger } from '@nestjs/common';
import {
  REGISTRATION_COMPLETION_REPOSITORY,
  type IRegistrationCompletionRepository,
} from '../../domain/ports/registration-completion-repository.port';
```

Keep the existing `USER_REPOSITORY` and `PASSWORD_HASHER` dependencies.

Add:

```ts
private readonly logger = new Logger(CompleteRegistrationUseCase.name);
```

Inject:

```ts
@Inject(REGISTRATION_COMPLETION_REPOSITORY)
private readonly registrationCompletion: IRegistrationCompletionRepository,
```

- [ ] **Step 2: Add a helper that derives optional consent input from the verified payload.**

Inside the class, add a private helper returning exactly the creation-port shape without a `userId`:

```ts
private consentFromPayload(
  payload: AuthChallengePayload,
  ip: string | null,
): RegistrationCompletionInput['consent'] {
  if (!payload.tenantId || !payload.acceptedVersionIds?.length) return undefined;
  return {
    tenantId: payload.tenantId,
    acceptedVersionIds: payload.acceptedVersionIds,
    acceptedLocale: payload.acceptedLocale ?? 'vi',
    ip,
  };
}
```

Import the required port/input types rather than duplicating them.

- [ ] **Step 3: Add conservative retry reconciliation.**

Add a private method with this contract:

```ts
private async reconcileExisting(
  existing: UserAccount | null,
  password: string,
  consent: RegistrationCompletionInput['consent'],
): Promise<boolean>
```

Implement these exact gates in order:

```ts
if (!existing) return false;
if (!existing.emailVerifiedAt || !existing.passwordHash) return false;
if (!(await this.hasher.verify(existing.passwordHash, password))) return false;

if (consent) {
  await this.registrationCompletion.emitConsent({
    ...consent,
    userId: existing.id,
  });
}

return true;
```

The method must not call `setPassword()` or mutate the user.

- [ ] **Step 4: Change completion-token handling from destructive-first to peek-first.**

At the beginning of `execute()`, replace:

```ts
const payload = await this.challenges.consumeCompletion(input.completionToken, 'registration');
```

with:

```ts
const payload = await this.challenges.peekCompletion(input.completionToken, 'registration');
```

Keep:

```ts
if (!payload?.fullName) expired();
```

Compute once:

```ts
const consent = this.consentFromPayload(payload, meta.ip ?? null);
```

- [ ] **Step 5: Handle a pre-existing user only through verified reconciliation.**

Replace the current immediate `UserAccount.assertEmailAvailable(existing)` path with:

```ts
const existing = await this.users.findByEmail(payload.email);
if (existing) {
  const reconciled = await this.reconcileExisting(existing, input.password, consent);
  if (!reconciled) UserAccount.assertEmailAvailable(existing);
  await this.cleanupCompletion(input.completionToken);
  return { success: true };
}
```

This deliberately preserves `EmailTaken` for unrelated accounts while allowing crash/retry recovery.

- [ ] **Step 6: Persist a new account through the atomic repository.**

Keep current password hashing and `UserAccount.register(...)` construction, then call:

```ts
const result = await this.registrationCompletion.create({
  user: newUser,
  ...(consent ? { consent } : {}),
});
```

For `result.status === 'created'`, proceed directly to cleanup and success.

For `result.status === 'email_conflict'`, re-read by email once:

```ts
const racedUser = await this.users.findByEmail(payload.email);
const reconciled = await this.reconcileExisting(racedUser, input.password, consent);
if (!reconciled) UserAccount.assertEmailAvailable(racedUser);
```

Do not loop indefinitely and do not retry the create operation.

- [ ] **Step 7: Add best-effort completion-token cleanup after durable success only.**

Add:

```ts
private async cleanupCompletion(completionToken: string): Promise<void> {
  try {
    await this.challenges.consumeCompletion(completionToken, 'registration');
  } catch (error) {
    this.logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      'Registration completed durably but completion-token cleanup failed',
    );
  }
}
```

If the repository uses the standard Nest `Logger` overload differently under current typings, use the repo-supported `Logger.warn(message, context?)` form, but log only a sanitized error message and never the completion token.

A `null` return from `consumeCompletion()` is not an error after durable completion.

- [ ] **Step 8: Remove the old non-atomic outbox block and its explanatory comment.**

Delete the block that calls:

```ts
this.tenantDb.forTenant(...)
this.outbox.emit(...)
```

Replace it with a concise comment only if needed to explain that the new repository owns the atomic user + outbox commit boundary. Do not keep stale documentation describing the old bug as current behavior.

- [ ] **Step 9: Run focused static verification.**

```bash
pnpm --filter=@booking/api typecheck
pnpm check:module-cycles
```

Expected: both exit `0`.

- [ ] **Step 10: Commit only the use-case file.**

```bash
git add -- apps/api/src/modules/identity-access/application/use-cases/complete-registration.use-case.ts
git diff --cached --check
git diff --cached
git commit -m "fix(auth): recover registration completion retries"
```

---

### Task 4: Wire the registration-completion repository into Nest

**Files:**
- Modify: `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts`

**Interfaces:**
- Consumes: `REGISTRATION_COMPLETION_REPOSITORY`, `PrismaRegistrationCompletionRepository`.
- Produces: injectable binding used by `CompleteRegistrationUseCase`.

- [ ] **Step 1: Add the port and adapter imports.**

Add:

```ts
import { REGISTRATION_COMPLETION_REPOSITORY } from '../../domain/ports/registration-completion-repository.port';
import { PrismaRegistrationCompletionRepository } from '../repositories/prisma-registration-completion.repository';
```

- [ ] **Step 2: Register the provider next to the other identity persistence bindings.**

Add to `providers`:

```ts
{
  provide: REGISTRATION_COMPLETION_REPOSITORY,
  useClass: PrismaRegistrationCompletionRepository,
},
```

Do not export the new port because no other module needs it.

- [ ] **Step 3: Run module/container static gates.**

```bash
pnpm --filter=@booking/api typecheck
pnpm check:module-cycles
pnpm check:no-tests
```

Expected: all exit `0`.

- [ ] **Step 4: Commit only the module wiring.**

```bash
git add -- apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts
git diff --cached --check
git diff --cached
git commit -m "fix(auth): wire registration completion repository"
```

---

### Task 5: Run full repository verification before runtime smoke

**Files:**
- No committed file changes expected.

**Interfaces:**
- Consumes: implementation from Tasks 1-4.
- Produces: static evidence required before runtime fault injection.

- [ ] **Step 1: Confirm the diff is scoped exactly to the six implementation files plus the approved docs.**

```bash
git status --short
git diff main...HEAD --stat
git diff main...HEAD -- \
  apps/api/src/modules/identity-access/domain/ports/auth-challenge-store.port.ts \
  apps/api/src/modules/identity-access/domain/ports/registration-completion-repository.port.ts \
  apps/api/src/modules/identity-access/infrastructure/services/redis-auth-challenge.store.ts \
  apps/api/src/modules/identity-access/infrastructure/repositories/prisma-registration-completion.repository.ts \
  apps/api/src/modules/identity-access/application/use-cases/complete-registration.use-case.ts \
  apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts
```

Expected: no unrelated application files.

- [ ] **Step 2: Run the repository's no-tests and architecture gates.**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm check:frontend-structure
pnpm check:theme-tokens
pnpm check:tenant-surfaces
```

Expected: all exit `0`.

- [ ] **Step 3: Run API lint, typecheck, build, and static RLS coverage.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
```

Expected: all exit `0`.

- [ ] **Step 4: Run the same frontend gates CI exercises to prove shared changes did not regress workspace builds.**

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all exit `0`.

- [ ] **Step 5: Record the exact command outputs/exit codes in the PR description or implementation handoff.**

Do not create a test-results file in the repository. If any command fails, stop and fix only the demonstrated failure before proceeding to runtime smoke.

---

### Task 6: Run focused real PostgreSQL/Redis registration smoke

**Files:**
- No committed file changes.
- Temporary disposable DB trigger and Redis ACL changes are allowed only in a local/disposable environment and must be reverted in the same smoke session.

**Interfaces:**
- HTTP endpoint: `POST /auth/registration/complete`
- Request shape:

```json
{
  "completionToken": "a-token-at-least-32-characters-long",
  "password": "SmokePass123"
}
```

- Redis completion key: `identity:auth-completion:${sha256(completionToken)}`.
- Registration payload JSON shape:

```json
{
  "purpose": "registration",
  "email": "data001-smoke@example.com",
  "fullName": "DATA001 Smoke",
  "locale": "vi"
}
```

For tenant-scoped cases add `tenantId`, `acceptedVersionIds`, and `acceptedLocale` from a disposable tenant with published legal versions.

- [ ] **Step 1: Start a disposable API/Postgres/Redis environment and export local helpers.**

Use the repo's normal local stack; do not point these steps at staging or production.

```bash
export API_BASE="http://localhost:3000"
export DATA001_PASSWORD="SmokePass123"
```

Confirm both database and Redis targets are local/disposable before fault injection:

```bash
printf '%s\n' "$MIGRATE_DATABASE_URL" "$REDIS_URL"
```

Stop if either value identifies a shared/staging/production service.

- [ ] **Step 2: Define a shell helper that writes a verified completion payload directly to Redis.**

This bypasses OTP/email delivery and tests only the completion boundary under audit:

```bash
seed_completion() {
  local token="$1"
  local payload="$2"
  local digest
  digest="$(printf '%s' "$token" | shasum -a 256 | awk '{print $1}')"
  redis-cli -u "$REDIS_URL" SET "identity:auth-completion:${digest}" "$payload" EX 1200 >/dev/null
  printf '%s\n' "$digest"
}
```

Every smoke token must be at least 32 characters to satisfy the HTTP contract.

- [ ] **Step 3: Verify non-tenant happy path and token cleanup.**

```bash
export REG_EMAIL="data001-happy-$(date +%s)@example.com"
export REG_TOKEN="data001-happy-completion-token-000001"
export REG_PAYLOAD="{\"purpose\":\"registration\",\"email\":\"${REG_EMAIL}\",\"fullName\":\"DATA001 Happy\",\"locale\":\"vi\"}"
export REG_DIGEST="$(seed_completion "$REG_TOKEN" "$REG_PAYLOAD")"

curl -i -sS -X POST "$API_BASE/auth/registration/complete" \
  -H 'content-type: application/json' \
  --data "{\"completionToken\":\"${REG_TOKEN}\",\"password\":\"${DATA001_PASSWORD}\"}"

redis-cli -u "$REDIS_URL" EXISTS "identity:auth-completion:${REG_DIGEST}"
psql "$MIGRATE_DATABASE_URL" -Atc "select count(*) from users where email='${REG_EMAIL}';"
```

Expected: HTTP `200`, Redis `EXISTS` returns `0`, user count is `1`.

- [ ] **Step 4: Force consent-outbox failure and prove user rollback + token retention.**

Pick one local tenant and current customer-facing legal versions from the disposable DB. Record the IDs in shell variables `TENANT_ID` and `VERSION_IDS_JSON`; do not invent UUIDs. Then install a temporary trigger that fails only registration-consent inserts:

```sql
CREATE OR REPLACE FUNCTION smoke_fail_registration_consent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'user.registration_consent' THEN
    RAISE EXCEPTION 'DATA001 forced registration-consent failure';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS smoke_fail_registration_consent ON outbox_events;
CREATE TRIGGER smoke_fail_registration_consent
BEFORE INSERT ON outbox_events
FOR EACH ROW EXECUTE FUNCTION smoke_fail_registration_consent();
```

Create a tenant-scoped Redis payload with:

```json
{
  "purpose": "registration",
  "email": "a fresh smoke email",
  "fullName": "DATA001 Rollback",
  "locale": "vi",
  "tenantId": "the selected tenant UUID",
  "acceptedVersionIds": ["the selected published version UUIDs"],
  "acceptedLocale": "vi"
}
```

Call `/auth/registration/complete`, then verify:

```bash
psql "$MIGRATE_DATABASE_URL" -Atc "select count(*) from users where email='${ROLLBACK_EMAIL}';"
redis-cli -u "$REDIS_URL" EXISTS "identity:auth-completion:${ROLLBACK_DIGEST}"
```

Expected: HTTP failure, user count `0`, Redis `EXISTS` `1`.

Immediately remove the fault injection:

```sql
DROP TRIGGER IF EXISTS smoke_fail_registration_consent ON outbox_events;
DROP FUNCTION IF EXISTS smoke_fail_registration_consent();
```

Repeat the exact same completion request. Expected: HTTP `200`, user count `1`, token removed, and a `user.registration_consent` outbox row exists or has already been processed.

- [ ] **Step 5: Simulate post-commit Redis cleanup failure and prove same-token reconciliation.**

On disposable Redis only, deny `GETDEL` while leaving `GET` allowed:

```bash
redis-cli -u "$REDIS_URL" ACL SETUSER default -getdel
```

Seed a fresh tenant-scoped completion token and call `/auth/registration/complete`.

Expected after implementation: HTTP `200` because PostgreSQL committed; logs contain the sanitized cleanup warning; user exists; consent outbox event exists; Redis completion key still exists.

Restore Redis immediately:

```bash
redis-cli -u "$REDIS_URL" ACL SETUSER default +getdel
```

Call the same completion request again with the same password.

Expected: HTTP `200`, still exactly one user, token now removed, password unchanged, and at-least-once consent means an additional consent event/acceptance is allowed.

If the disposable Redis configuration does not permit ACL changes, do not alter production-like Redis. Record this case as `NEEDS VERIFICATION` and use a disposable Redis instance where command ACL can be changed.

- [ ] **Step 6: Verify a conflicting existing account is not treated as a retry.**

Create a fresh password account through the existing legacy registration endpoint:

```bash
export CONFLICT_EMAIL="data001-conflict-$(date +%s)@example.com"
curl -i -sS -X POST "$API_BASE/auth/register" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"${CONFLICT_EMAIL}\",\"password\":\"ExistingPass123\",\"fullName\":\"Existing Account\",\"locale\":\"vi\"}"
```

Seed a registration completion token for the same email but submit `DifferentPass123` to `/auth/registration/complete`.

Expected: domain/API error corresponding to `EmailTaken`; the existing account remains login-capable with `ExistingPass123`; no recovery consent event is emitted for the conflicting request.

- [ ] **Step 7: Exercise the concurrent same-token path.**

Seed one fresh completion token, then start two requests simultaneously:

```bash
for i in 1 2; do
  curl -sS -o "/tmp/data001-concurrent-${i}.out" -w "%{http_code}\n" \
    -X POST "$API_BASE/auth/registration/complete" \
    -H 'content-type: application/json' \
    --data "{\"completionToken\":\"${CONCURRENT_TOKEN}\",\"password\":\"${DATA001_PASSWORD}\"}" &
done
wait
cat /tmp/data001-concurrent-1.out
cat /tmp/data001-concurrent-2.out
```

Then verify exactly one `users` row exists for `CONCURRENT_EMAIL`. If both requests peeked before cleanup, both should reconcile successfully; if one reached Redis only after the other deleted the token, that request may receive the normal expired-token response. In all cases, duplicate users and credential mutation are forbidden.

Delete the temporary `/tmp/data001-concurrent-*.out` files after inspection.

- [ ] **Step 8: Verify password-reset behavior is unchanged.**

Use the normal password-reset start/verify/complete flow in the disposable environment or seed a `password_reset` completion payload with a valid existing `userId`. Complete it once, then call the same completion token again.

Expected: first completion follows current behavior; second attempt is expired because password reset still uses destructive `consumeCompletion()`.

- [ ] **Step 9: Verify eventual legal-consent delivery for one tenant-scoped success.**

Allow the normal outbox relay to run. Query the local DB for the smoke user's `agreement_acceptances` rows and confirm the expected tenant, accepted version IDs, and accepted locale are present. Duplicate acceptance rows are allowed by the current ADR 0008 contract; missing acceptance after the relay retry window is a failure requiring investigation.

- [ ] **Step 10: Confirm all fault injection was reverted and record evidence.**

Verify no smoke trigger/function remains and Redis `GETDEL` is enabled:

```bash
psql "$MIGRATE_DATABASE_URL" -Atc "select tgname from pg_trigger where tgname='smoke_fail_registration_consent';"
redis-cli -u "$REDIS_URL" ACL GETUSER default
```

Record HTTP statuses, SQL counts, Redis key checks, and any intentionally duplicated consent rows in the PR/handoff. Do not commit credentials, tokens, local DB dumps, or smoke-output files.

---

### Task 7: Final review and PR preparation

**Files:**
- No new application files expected.
- Modify docs only if implementation discovers a design mismatch that must be documented before merge.

**Interfaces:**
- Consumes: all implementation and verification evidence.
- Produces: reviewable branch ready for a draft PR; merge remains a separate explicit action.

- [ ] **Step 1: Re-read the design acceptance criteria line by line against the final diff.**

Confirm each of these has concrete evidence:

- non-destructive registration token read;
- atomic user + consent event transaction;
- failed DB work keeps token retryable;
- post-commit retry reconciliation verifies account ownership by password;
- no password overwrite;
- unique-email race reconciles once;
- unrelated existing account still fails;
- cleanup runs after durable success and cleanup failure does not reverse success;
- password-reset semantics unchanged;
- no legal module import/cycle;
- no schema migration/test artifacts;
- static verification passed;
- real DB/Redis smoke evidence is recorded or explicitly marked `NEEDS VERIFICATION`.

- [ ] **Step 2: Inspect final branch state.**

```bash
git status --short
git log --oneline --decorate main..HEAD
git diff --check main...HEAD
git diff --stat main...HEAD
```

Expected: clean worktree, no whitespace errors, only approved DATA-001 docs/implementation files.

- [ ] **Step 3: Run one fresh final verification pass before any completion claim.**

```bash
pnpm check:no-tests \
  && pnpm check:module-cycles \
  && pnpm --filter=@booking/api lint \
  && pnpm --filter=@booking/api typecheck \
  && pnpm --filter=@booking/api build \
  && pnpm --filter=@booking/api check:rls
```

Expected: exit code `0` for the combined command.

- [ ] **Step 4: Prepare the PR summary without claiming unexecuted smoke cases passed.**

The PR body should state:

- root cause: destructive Redis token consumption plus split PostgreSQL durability boundary;
- solution: `peekCompletion` + atomic registration repository + conservative retry reconciliation + post-commit cleanup;
- changed files and no-migration/no-test-artifact scope;
- exact static checks that passed;
- each runtime smoke result with evidence;
- any case not run as `NEEDS VERIFICATION`.

Do not merge or deploy as part of this plan without a separate explicit instruction.
