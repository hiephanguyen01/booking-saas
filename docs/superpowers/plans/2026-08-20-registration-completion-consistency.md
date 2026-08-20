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
- Preserve password-reset completion semantics: it continues using destructive `consumeCompletion()` exactly as before.
- Do not add a Prisma schema migration or a durable registration-attempt table.
- Do not overwrite an existing user's password during retry reconciliation.
- Treat duplicate `user.registration_consent` delivery as acceptable at-least-once behavior; do not add an outbox dedupe schema for this fix.
- Never log raw passwords, OTPs, completion tokens, or password hashes.
- Keep changes scoped to DATA-001; no unrelated auth, legal, session, or outbox refactors.

---

## File Structure

**Create**

- `apps/api/src/modules/identity-access/domain/ports/registration-completion-repository.port.ts` — durable registration-completion interface and result types.
- `apps/api/src/modules/identity-access/infrastructure/repositories/prisma-registration-completion.repository.ts` — atomic user + consent-event persistence and recovery consent emission on the admin pool.

**Modify**

- `apps/api/src/modules/identity-access/domain/ports/auth-challenge-store.port.ts` — add `peekCompletion()`.
- `apps/api/src/modules/identity-access/infrastructure/services/redis-auth-challenge.store.ts` — implement `peekCompletion()` with Redis `GET`.
- `apps/api/src/modules/identity-access/application/use-cases/complete-registration.use-case.ts` — durable create, reconciliation, and best-effort token cleanup.
- `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts` — bind the new port to its Prisma adapter.

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
- Consumes: existing `AuthChallengePayload`, `AuthChallengePurpose`, and completion-key hashing.
- Produces:

```ts
peekCompletion(
  completionToken: string,
  purpose: AuthChallengePurpose,
): Promise<AuthChallengePayload | null>;
```

- [ ] **Step 1: Add `peekCompletion()` to `IAuthChallengeStore`.**

Put it immediately before `consumeCompletion()`:

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

Keep every existing method unchanged.

- [ ] **Step 2: Implement `RedisAuthChallengeStore.peekCompletion()`.**

Put this directly above `consumeCompletion()`:

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

- [ ] **Step 3: Verify password-reset destructive consumption remains untouched.**

Confirm `consumeCompletion()` still contains:

```ts
const value = await this.redis.getdel(this.completionKey(completionToken));
```

and `CompletePasswordResetUseCase` still calls:

```ts
this.challenges.consumeCompletion(input.completionToken, 'password_reset')
```

- [ ] **Step 4: Run focused verification.**

```bash
pnpm --filter=@booking/api typecheck
```

Expected: exit `0`.

- [ ] **Step 5: Commit only Task 1 files.**

```bash
git add -- \
  apps/api/src/modules/identity-access/domain/ports/auth-challenge-store.port.ts \
  apps/api/src/modules/identity-access/infrastructure/services/redis-auth-challenge.store.ts
git diff --cached --check
git diff --cached
git commit -m "fix(auth): add recoverable completion token read"
```

---

### Task 2: Add the atomic registration-completion persistence boundary

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

- [ ] **Step 1: Create the identity-access port.**

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

No Prisma types leave the infrastructure layer.

- [ ] **Step 2: Create the Prisma adapter skeleton and mapper.**

Create `prisma-registration-completion.repository.ts` starting with:

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

function isUserEmailConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.some((field) => String(field) === 'email');
  return String(target ?? '').includes('email');
}

@Injectable()
export class PrismaRegistrationCompletionRepository
  implements IRegistrationCompletionRepository
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}
}
```

The `P2002` guard must identify the user email constraint specifically; a future unrelated unique failure must still throw.

- [ ] **Step 3: Add one helper that emits the consent event inside a supplied transaction.**

Inside the class:

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

Use this helper for both initial create and recovery emission so payload shapes cannot drift.

- [ ] **Step 4: Implement `create()` as a single admin-pool transaction.**

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
    if (isUserEmailConflict(error)) return { status: 'email_conflict' };
    throw error;
  }
}
```

An outbox failure must abort the same transaction and therefore roll back the user insert.

- [ ] **Step 5: Implement recovery consent emission.**

```ts
async emitConsent(input: RegistrationConsentEventInput): Promise<void> {
  await this.prisma.admin.$transaction((tx) => this.emitConsentInTx(tx, input));
}
```

Do not query legal state and do not dedupe the event.

- [ ] **Step 6: Run focused verification.**

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
- Consumes `peekCompletion()`/`consumeCompletion()`, `IRegistrationCompletionRepository`, `IUserRepository`, and `IPasswordHasher`.
- Produces the existing `Promise<AuthFlowCompleteResponse>` contract unchanged.

- [ ] **Step 1: Replace the old transaction/outbox dependencies with the new port.**

Change the Nest import to:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
```

Remove imports for `TenantDbService` and `OutboxService`.

Add these imports:

```ts
import type { AuthChallengePayload } from '../../domain/ports/auth-challenge-store.port';
import {
  REGISTRATION_COMPLETION_REPOSITORY,
  type IRegistrationCompletionRepository,
  type RegistrationCompletionInput,
} from '../../domain/ports/registration-completion-repository.port';
```

Keep the existing auth challenge store, user repository, password hasher, `UserAccount`, and `expired` imports.

Inside the class add:

```ts
private readonly logger = new Logger(CompleteRegistrationUseCase.name);
```

Replace the `TenantDbService`/`OutboxService` constructor parameters with:

```ts
@Inject(REGISTRATION_COMPLETION_REPOSITORY)
private readonly registrationCompletion: IRegistrationCompletionRepository,
```

- [ ] **Step 2: Add deterministic consent derivation.**

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

- [ ] **Step 3: Add conservative existing-account reconciliation.**

```ts
private async reconcileExisting(
  existing: UserAccount | null,
  password: string,
  consent: RegistrationCompletionInput['consent'],
): Promise<boolean> {
  if (!existing?.emailVerifiedAt || !existing.passwordHash) return false;
  if (!(await this.hasher.verify(existing.passwordHash, password))) return false;

  if (consent) {
    await this.registrationCompletion.emitConsent({
      ...consent,
      userId: existing.id,
    });
  }

  return true;
}
```

This method never calls `setPassword()` and never mutates the existing user.

- [ ] **Step 4: Add post-durable best-effort Redis cleanup.**

```ts
private async cleanupCompletion(completionToken: string): Promise<void> {
  try {
    await this.challenges.consumeCompletion(completionToken, 'registration');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `registration completed durably but completion-token cleanup failed: ${message}`,
    );
  }
}
```

Do not include `completionToken`, password, OTP, or password hash in the log. A `null` return from `consumeCompletion()` is acceptable after durable success and requires no warning.

- [ ] **Step 5: Switch `execute()` to non-destructive token read.**

Start with:

```ts
const payload = await this.challenges.peekCompletion(input.completionToken, 'registration');
if (!payload?.fullName) expired();
const consent = this.consentFromPayload(payload, meta.ip ?? null);
```

Do not call `consumeCompletion()` before durable persistence/reconciliation.

- [ ] **Step 6: Reconcile a pre-existing account instead of blindly rejecting it.**

```ts
const existing = await this.users.findByEmail(payload.email);
if (existing) {
  const reconciled = await this.reconcileExisting(existing, input.password, consent);
  if (!reconciled) UserAccount.assertEmailAvailable(existing);
  await this.cleanupCompletion(input.completionToken);
  return { success: true };
}
```

`UserAccount.assertEmailAvailable(existing)` preserves the existing `EmailTaken` domain error when ownership cannot be proven.

- [ ] **Step 7: Persist a new account through the atomic repository.**

Keep the existing password hash and `UserAccount.register(...)` construction, then replace direct `users.create()` with:

```ts
const result = await this.registrationCompletion.create({
  user: newUser,
  ...(consent ? { consent } : {}),
});
```

If `result.status === 'created'`, run cleanup and return success.

- [ ] **Step 8: Reconcile exactly one unique-email race.**

For `email_conflict`:

```ts
const racedUser = await this.users.findByEmail(payload.email);
if (!racedUser) {
  throw new Error('Registration email conflict could not be reconciled');
}

const reconciled = await this.reconcileExisting(racedUser, input.password, consent);
if (!reconciled) UserAccount.assertEmailAvailable(racedUser);

await this.cleanupCompletion(input.completionToken);
return { success: true };
```

Do not retry create in a loop. If the row disappears after PostgreSQL reported an email conflict, surface an internal error rather than incorrectly returning success.

- [ ] **Step 9: Remove the old separate tenant outbox transaction and stale explanatory comment.**

Delete the old block using:

```ts
this.tenantDb.forTenant(...)
this.outbox.emit(...)
```

No direct legal call replaces it; the new persistence adapter owns the atomic outbox write.

- [ ] **Step 10: Run focused verification.**

```bash
pnpm --filter=@booking/api typecheck
pnpm check:module-cycles
```

Expected: both exit `0`.

- [ ] **Step 11: Commit only the use-case file.**

```bash
git add -- apps/api/src/modules/identity-access/application/use-cases/complete-registration.use-case.ts
git diff --cached --check
git diff --cached
git commit -m "fix(auth): recover registration completion retries"
```

---

### Task 4: Wire the new repository and run static repository gates

**Files:**
- Modify: `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts`

**Interfaces:**
- Consumes `REGISTRATION_COMPLETION_REPOSITORY` and `PrismaRegistrationCompletionRepository`.
- Produces the Nest binding required by `CompleteRegistrationUseCase`.

- [ ] **Step 1: Add imports.**

```ts
import { REGISTRATION_COMPLETION_REPOSITORY } from '../../domain/ports/registration-completion-repository.port';
import { PrismaRegistrationCompletionRepository } from '../repositories/prisma-registration-completion.repository';
```

- [ ] **Step 2: Register the provider beside the other identity persistence bindings.**

```ts
{
  provide: REGISTRATION_COMPLETION_REPOSITORY,
  useClass: PrismaRegistrationCompletionRepository,
},
```

Do not export it; no other module consumes this port.

- [ ] **Step 3: Run the repository-prescribed static gates.**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm check:frontend-structure
pnpm check:theme-tokens
pnpm check:tenant-surfaces
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
pnpm lint
pnpm typecheck
pnpm build
```

Expected: every command exits `0`. Record the exact failing command and output if one does not; do not claim later gates passed if they were not run.

- [ ] **Step 4: Confirm implementation scope before committing.**

```bash
git status --short
git diff --check
git diff --stat
```

Expected implementation scope: exactly the six DATA-001 source files listed in this plan; docs are already present on the branch.

- [ ] **Step 5: Commit only module wiring.**

```bash
git add -- apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts
git diff --cached --check
git diff --cached
git commit -m "fix(auth): wire registration completion repository"
```

---

### Task 5: Run focused real PostgreSQL/Redis smoke and final review

**Files:**
- No committed source changes expected.
- Temporary fault-injection state is permitted only in a disposable local PostgreSQL/Redis environment and must be reverted in the same session.

**Interfaces:**
- Endpoint: `POST /auth/registration/complete`.
- Completion Redis key: `identity:auth-completion:${sha256(completionToken)}`.
- Request:

```json
{
  "completionToken": "data001-completion-token-at-least-32-chars",
  "password": "SmokePass123"
}
```

- [ ] **Step 1: Start only a disposable local environment and export helpers.**

```bash
export API_BASE="http://localhost:3000"
export DATA001_PASSWORD="SmokePass123"
printf '%s\n' "$MIGRATE_DATABASE_URL" "$REDIS_URL"
```

Stop if either connection points at a shared, staging, or production service.

- [ ] **Step 2: Define a helper that creates a verified completion payload directly in Redis.**

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

This bypasses OTP/email and isolates the completion boundary under audit.

- [ ] **Step 3: Non-tenant happy path.**

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

Expected: HTTP `200`, Redis `EXISTS` is `0`, user count is `1`.

- [ ] **Step 4: Prepare one valid tenant-scoped completion payload from the disposable DB.**

Query an existing local tenant and its currently published customer-facing legal version IDs. Use those real UUIDs to set:

```bash
export TENANT_ID="...local tenant UUID from the query..."
export VERSION_IDS_JSON='["...published customer terms UUID...","...published privacy UUID..."]'
```

Before continuing, verify both version rows belong to `TENANT_ID` and are published. These values are runtime observations, not committed constants.

- [ ] **Step 5: Force outbox failure and prove atomic rollback plus token retention.**

On the disposable DB only, install:

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

Seed a tenant-scoped Redis payload containing `tenantId`, `acceptedVersionIds`, and `acceptedLocale: "vi"`, then call `/auth/registration/complete`.

Expected: HTTP failure, matching `users` count `0`, completion Redis key still exists.

Immediately remove the fault:

```sql
DROP TRIGGER IF EXISTS smoke_fail_registration_consent ON outbox_events;
DROP FUNCTION IF EXISTS smoke_fail_registration_consent();
```

Repeat the same completion request. Expected: HTTP `200`, exactly one user, token removed, and the consent outbox event is durable or already processed.

- [ ] **Step 6: Simulate post-commit Redis cleanup failure and prove same-token reconciliation.**

On disposable Redis only:

```bash
redis-cli -u "$REDIS_URL" ACL SETUSER default -getdel
```

Seed a fresh tenant-scoped token and complete registration.

Expected: HTTP `200`; user and consent event are durable; completion key remains; API logs one sanitized cleanup warning.

Restore immediately:

```bash
redis-cli -u "$REDIS_URL" ACL SETUSER default +getdel
```

Repeat the same completion request with the same password. Expected: HTTP `200`, still exactly one user, token removed, password unchanged. An extra consent event/acceptance is allowed by the at-least-once contract.

If the local Redis user cannot change ACLs, record this case as `NEEDS VERIFICATION` rather than touching any shared Redis service.

- [ ] **Step 7: Prove unrelated existing accounts still fail.**

Create an account with a fresh email via the existing `/auth/register` endpoint using password `ExistingPass123`. Seed a registration completion token for that same email and submit `DifferentPass123` to `/auth/registration/complete`.

Expected: the API returns the existing `EmailTaken` domain result; login with `ExistingPass123` still works; no password mutation occurs; no recovery consent event is emitted for the conflicting completion.

- [ ] **Step 8: Exercise concurrent completion.**

Seed one fresh token and launch two completion requests in parallel:

```bash
for i in 1 2; do
  curl -sS -o "/tmp/data001-concurrent-${i}.out" -w "%{http_code}\n" \
    -X POST "$API_BASE/auth/registration/complete" \
    -H 'content-type: application/json' \
    --data "{\"completionToken\":\"${CONCURRENT_TOKEN}\",\"password\":\"${DATA001_PASSWORD}\"}" &
done
wait
```

Expected invariant: exactly one `users` row for the email and no credential mutation. If both requests peek before token deletion, both may return success through reconciliation; if one reaches Redis after deletion, the normal expired-token response is acceptable.

Remove `/tmp/data001-concurrent-*.out` after inspection.

- [ ] **Step 9: Verify password-reset regression boundary.**

Run the existing password-reset completion flow in the disposable environment and submit the same completion token twice.

Expected: first completion follows existing behavior; second attempt is expired because password reset still uses `GETDEL` through `consumeCompletion()`.

- [ ] **Step 10: Verify eventual legal delivery.**

Allow the normal outbox relay to process one tenant-scoped smoke registration. Query `agreement_acceptances` for that user and confirm the expected tenant, accepted version IDs, and accepted locale are present. Duplicate rows are acceptable; missing acceptance after relay retries is a failure.

- [ ] **Step 11: Prove all fault injection was reverted.**

```bash
psql "$MIGRATE_DATABASE_URL" -Atc "select tgname from pg_trigger where tgname='smoke_fail_registration_consent';"
redis-cli -u "$REDIS_URL" ACL GETUSER default
```

Expected: no smoke trigger; `GETDEL` permission restored.

- [ ] **Step 12: Run one fresh final verification pass.**

```bash
pnpm check:no-tests \
  && pnpm check:module-cycles \
  && pnpm --filter=@booking/api lint \
  && pnpm --filter=@booking/api typecheck \
  && pnpm --filter=@booking/api build \
  && pnpm --filter=@booking/api check:rls
```

Expected: combined exit `0`.

- [ ] **Step 13: Review final branch scope and prepare handoff.**

```bash
git status --short
git log --oneline --decorate main..HEAD
git diff --check main...HEAD
git diff --stat main...HEAD
```

Record exact static-check results and runtime smoke evidence in the PR/handoff. Mark any unexecuted runtime case `NEEDS VERIFICATION`. Do not merge or deploy without separate explicit authorization.
