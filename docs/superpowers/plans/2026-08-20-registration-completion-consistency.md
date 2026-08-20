# Registration Completion Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make registration completion recoverable and idempotent so user creation and registration-consent outbox production are atomic, while Redis completion-token cleanup happens only after durable success.

**Architecture:** Registration completion reads its Redis completion payload non-destructively, then persists the global user plus optional tenant-tagged `user.registration_consent` event in one `prisma.admin` transaction behind an identity-access-owned port. Safe retries reconcile an already-created account only after verified password ownership, optionally re-emit consent under the existing at-least-once contract, and finally consume the Redis token as cleanup.

**Tech Stack:** NestJS 11, TypeScript 5.8, Prisma 6/PostgreSQL, ioredis/Redis, Argon2, transactional outbox.

**Spec:** `docs/superpowers/specs/2026-08-20-registration-completion-consistency-design.md`

## Global Constraints

- Follow ADR 0003: inter-module write-path side effects cross module boundaries through the transactional outbox.
- Preserve the `identity-access -> legal` DAG; do not import legal application/infrastructure code and do not introduce `forwardRef()`.
- Follow ADR 0005: do not add `*.test.*`, `*.spec.*`, Jest, Vitest, Playwright, test scripts, or CI test steps.
- Password-reset completion continues using destructive `consumeCompletion()` exactly as before.
- Do not add a Prisma schema migration or a durable registration-attempt table.
- Do not overwrite an existing user's password during retry reconciliation.
- Duplicate `user.registration_consent` delivery remains acceptable at-least-once behavior; do not add an outbox dedupe schema.
- Never log passwords, OTPs, completion tokens, or password hashes.
- Keep the patch scoped to DATA-001.

---

## File Structure

**Create**

- `apps/api/src/modules/identity-access/domain/ports/registration-completion-repository.port.ts`
- `apps/api/src/modules/identity-access/infrastructure/repositories/prisma-registration-completion.repository.ts`

**Modify**

- `apps/api/src/modules/identity-access/domain/ports/auth-challenge-store.port.ts`
- `apps/api/src/modules/identity-access/infrastructure/services/redis-auth-challenge.store.ts`
- `apps/api/src/modules/identity-access/application/use-cases/complete-registration.use-case.ts`
- `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts`

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
- Produces:

```ts
peekCompletion(
  completionToken: string,
  purpose: AuthChallengePurpose,
): Promise<AuthChallengePayload | null>;
```

- [ ] **Step 1: Add `peekCompletion()` immediately before `consumeCompletion()` in `IAuthChallengeStore`.**

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

- [ ] **Step 2: Implement `RedisAuthChallengeStore.peekCompletion()` with `GET`.**

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

Do not extend TTL and do not create a new Redis key.

- [ ] **Step 3: Confirm destructive consumption remains unchanged.**

`RedisAuthChallengeStore.consumeCompletion()` must still use:

```ts
const value = await this.redis.getdel(this.completionKey(completionToken));
```

`CompletePasswordResetUseCase` must still call:

```ts
this.challenges.consumeCompletion(input.completionToken, 'password_reset')
```

- [ ] **Step 4: Verify.**

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

- [ ] **Step 1: Create the port file with the exact interfaces above.**

Imports:

```ts
import type { Locale } from '@booking/contracts';
import type { NewUserAccount } from '../entities/user-account.entity';
import type { UserRecord } from './user-repository.port';
```

No Prisma type may appear in this file.

- [ ] **Step 2: Create the Prisma adapter skeleton.**

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

Only the user-email `P2002` is translated to `email_conflict`; unrelated `P2002` errors rethrow.

- [ ] **Step 3: Add one transaction-scoped consent emitter.**

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

- [ ] **Step 4: Implement atomic `create()`.**

```ts
async create(input: RegistrationCompletionInput): Promise<RegistrationCompletionCreateResult> {
  try {
    return await this.prisma.admin.$transaction(async (tx) => {
      const row = await tx.user.create({ data: input.user });
      const user = toUserRecord(row);

      if (input.consent) {
        await this.emitConsentInTx(tx, { ...input.consent, userId: user.id });
      }

      return { status: 'created', user } as const;
    });
  } catch (error) {
    if (isUserEmailConflict(error)) return { status: 'email_conflict' };
    throw error;
  }
}
```

If the outbox insert fails, the user insert must roll back in the same transaction.

- [ ] **Step 5: Implement recovery `emitConsent()`.**

```ts
async emitConsent(input: RegistrationConsentEventInput): Promise<void> {
  await this.prisma.admin.$transaction((tx) => this.emitConsentInTx(tx, input));
}
```

Do not query legal state and do not dedupe the event.

- [ ] **Step 6: Verify.**

```bash
pnpm --filter=@booking/api typecheck
pnpm check:module-cycles
```

Expected: both exit `0`.

- [ ] **Step 7: Commit Task 2 files.**

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
- Consumes Task 1 and Task 2 interfaces plus existing `IUserRepository` and `IPasswordHasher`.
- Produces the existing `Promise<AuthFlowCompleteResponse>` contract unchanged.

- [ ] **Step 1: Replace old tenant/outbox dependencies.**

Use:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
```

Remove `TenantDbService` and `OutboxService` imports/dependencies. Add:

```ts
import type { AuthChallengePayload } from '../../domain/ports/auth-challenge-store.port';
import {
  REGISTRATION_COMPLETION_REPOSITORY,
  type IRegistrationCompletionRepository,
  type RegistrationCompletionInput,
} from '../../domain/ports/registration-completion-repository.port';
```

Add:

```ts
private readonly logger = new Logger(CompleteRegistrationUseCase.name);
```

Inject:

```ts
@Inject(REGISTRATION_COMPLETION_REPOSITORY)
private readonly registrationCompletion: IRegistrationCompletionRepository,
```

- [ ] **Step 2: Add consent derivation.**

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

- [ ] **Step 3: Add conservative retry reconciliation.**

```ts
private async reconcileExisting(
  existing: UserAccount | null,
  password: string,
  consent: RegistrationCompletionInput['consent'],
): Promise<boolean> {
  if (!existing?.emailVerifiedAt || !existing.passwordHash) return false;
  if (!(await this.hasher.verify(existing.passwordHash, password))) return false;

  if (consent) {
    await this.registrationCompletion.emitConsent({ ...consent, userId: existing.id });
  }
  return true;
}
```

Never call `setPassword()` from this path.

- [ ] **Step 4: Add best-effort cleanup after durable success.**

```ts
private async cleanupCompletion(completionToken: string): Promise<void> {
  try {
    await this.challenges.consumeCompletion(completionToken, 'registration');
  } catch {
    this.logger.warn('registration completed durably but completion-token cleanup failed');
  }
}
```

A `null` result is acceptable because another concurrent request may already have deleted the key. The warning is intentionally fixed text so Redis errors cannot accidentally expose command arguments.

- [ ] **Step 5: Change `execute()` to peek first.**

```ts
const payload = await this.challenges.peekCompletion(input.completionToken, 'registration');
if (!payload?.fullName) expired();
const consent = this.consentFromPayload(payload, meta.ip ?? null);
```

No `consumeCompletion()` call is allowed before durable create/reconciliation.

- [ ] **Step 6: Reconcile an existing account only after password ownership proof.**

```ts
const existing = await this.users.findByEmail(payload.email);
if (existing) {
  const reconciled = await this.reconcileExisting(existing, input.password, consent);
  if (!reconciled) UserAccount.assertEmailAvailable(existing);
  await this.cleanupCompletion(input.completionToken);
  return { success: true };
}
```

- [ ] **Step 7: Persist a new account through the atomic repository.**

Keep the existing password hash and `UserAccount.register(...)` construction, then:

```ts
const result = await this.registrationCompletion.create({
  user: newUser,
  ...(consent ? { consent } : {}),
});

if (result.status === 'created') {
  await this.cleanupCompletion(input.completionToken);
  return { success: true };
}
```

- [ ] **Step 8: Reconcile exactly one email-uniqueness race.**

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

Do not loop or retry creation. A disappearing conflict row becomes an internal error, never a false success.

- [ ] **Step 9: Delete the old separate tenant outbox block and stale comment.**

Remove the code using:

```ts
this.tenantDb.forTenant(...)
this.outbox.emit(...)
```

No direct legal call replaces it.

- [ ] **Step 10: Verify.**

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

### Task 4: Wire the repository and run static gates

**Files:**
- Modify: `apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts`

- [ ] **Step 1: Add imports.**

```ts
import { REGISTRATION_COMPLETION_REPOSITORY } from '../../domain/ports/registration-completion-repository.port';
import { PrismaRegistrationCompletionRepository } from '../repositories/prisma-registration-completion.repository';
```

- [ ] **Step 2: Register the provider.**

```ts
{
  provide: REGISTRATION_COMPLETION_REPOSITORY,
  useClass: PrismaRegistrationCompletionRepository,
},
```

Do not export it.

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

Expected: every command exits `0`. Stop at the first failure and investigate it before making any pass claim.

- [ ] **Step 4: Confirm scope.**

```bash
git status --short
git diff --check
git diff --stat
```

Expected source scope: the six DATA-001 files listed in this plan only.

- [ ] **Step 5: Commit module wiring.**

```bash
git add -- apps/api/src/modules/identity-access/infrastructure/http/identity-access.module.ts
git diff --cached --check
git diff --cached
git commit -m "fix(auth): wire registration completion repository"
```

---

### Task 5: Run focused real PostgreSQL/Redis smoke and final review

**Files:**
- No committed source changes.
- Fault injection is permitted only in a disposable local PostgreSQL/Redis environment and must be reverted in the same session.

**Endpoint:** `POST /auth/registration/complete`

- [ ] **Step 1: Confirm disposable connections and define helpers.**

```bash
export API_BASE="http://localhost:3000"
export DATA001_PASSWORD="SmokePass123"
printf '%s\n' "$MIGRATE_DATABASE_URL" "$REDIS_URL"
```

Stop if either connection points at a shared, staging, or production service.

Create a Redis helper:

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

- [ ] **Step 2: Verify non-tenant happy path.**

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

- [ ] **Step 3: Derive a real local tenant and current customer legal versions.**

```bash
read -r TENANT_ID CUSTOMER_TERMS_ID PRIVACY_ID < <(
  psql "$MIGRATE_DATABASE_URL" -At -F ' ' -c "
    SELECT
      d.tenant_id,
      max(d.current_version_id::text) FILTER (WHERE d.doc_type = 'customer_terms'),
      max(d.current_version_id::text) FILTER (WHERE d.doc_type = 'privacy_policy')
    FROM legal_documents d
    JOIN legal_document_versions v
      ON v.id = d.current_version_id
     AND v.published_at IS NOT NULL
    WHERE d.doc_type IN ('customer_terms', 'privacy_policy')
    GROUP BY d.tenant_id
    HAVING count(*) = 2
    LIMIT 1;
  "
)

test -n "$TENANT_ID"
test -n "$CUSTOMER_TERMS_ID"
test -n "$PRIVACY_ID"
export VERSION_IDS_JSON="[\"${CUSTOMER_TERMS_ID}\",\"${PRIVACY_ID}\"]"
```

Expected: all three values are non-empty local UUIDs.

- [ ] **Step 4: Force outbox insertion failure and prove atomic rollback/token retention.**

Install this temporary trigger on the disposable DB:

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

Create a fresh tenant-scoped completion payload:

```bash
export ROLLBACK_EMAIL="data001-rollback-$(date +%s)@example.com"
export ROLLBACK_TOKEN="data001-rollback-completion-token-0001"
export ROLLBACK_PAYLOAD="{\"purpose\":\"registration\",\"email\":\"${ROLLBACK_EMAIL}\",\"fullName\":\"DATA001 Rollback\",\"locale\":\"vi\",\"tenantId\":\"${TENANT_ID}\",\"acceptedVersionIds\":${VERSION_IDS_JSON},\"acceptedLocale\":\"vi\"}"
export ROLLBACK_DIGEST="$(seed_completion "$ROLLBACK_TOKEN" "$ROLLBACK_PAYLOAD")"
```

Call completion and then check:

```bash
curl -i -sS -X POST "$API_BASE/auth/registration/complete" \
  -H 'content-type: application/json' \
  --data "{\"completionToken\":\"${ROLLBACK_TOKEN}\",\"password\":\"${DATA001_PASSWORD}\"}"
psql "$MIGRATE_DATABASE_URL" -Atc "select count(*) from users where email='${ROLLBACK_EMAIL}';"
redis-cli -u "$REDIS_URL" EXISTS "identity:auth-completion:${ROLLBACK_DIGEST}"
```

Expected: HTTP failure, user count `0`, Redis `EXISTS` is `1`.

Remove the trigger/function immediately:

```bash
psql "$MIGRATE_DATABASE_URL" <<'SQL'
DROP TRIGGER IF EXISTS smoke_fail_registration_consent ON outbox_events;
DROP FUNCTION IF EXISTS smoke_fail_registration_consent();
SQL
```

Repeat the same completion request. Expected: HTTP `200`, exactly one user, token removed, and a registration-consent outbox row is durable or already processed.

- [ ] **Step 5: Simulate cleanup failure and then retry the same committed token.**

Identify the authenticated Redis ACL user and deny only `GETDEL`:

```bash
export DATA001_REDIS_USER="$(redis-cli -u "$REDIS_URL" --raw ACL WHOAMI)"
test -n "$DATA001_REDIS_USER"
redis-cli -u "$REDIS_URL" ACL SETUSER "$DATA001_REDIS_USER" -getdel
```

Seed a fresh tenant-scoped token and complete registration. Expected: HTTP `200`, user/event durable, Redis key remains, one fixed-text cleanup warning is logged.

Restore permission immediately:

```bash
redis-cli -u "$REDIS_URL" ACL SETUSER "$DATA001_REDIS_USER" +getdel
```

Repeat the exact same completion request with the same password. Expected: HTTP `200`, one user only, token removed, no password change. A duplicate consent event/acceptance is allowed.

If the disposable Redis instance does not permit ACL changes, record this case as `NEEDS VERIFICATION`; do not alter a shared Redis service.

- [ ] **Step 6: Prove an unrelated existing account is not reconciled.**

```bash
export CONFLICT_EMAIL="data001-conflict-$(date +%s)@example.com"
curl -i -sS -X POST "$API_BASE/auth/register" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"${CONFLICT_EMAIL}\",\"password\":\"ExistingPass123\",\"fullName\":\"Existing Account\",\"locale\":\"vi\"}"

export CONFLICT_TOKEN="data001-conflict-completion-token-0001"
export CONFLICT_PAYLOAD="{\"purpose\":\"registration\",\"email\":\"${CONFLICT_EMAIL}\",\"fullName\":\"Conflict Attempt\",\"locale\":\"vi\"}"
seed_completion "$CONFLICT_TOKEN" "$CONFLICT_PAYLOAD" >/dev/null

curl -i -sS -X POST "$API_BASE/auth/registration/complete" \
  -H 'content-type: application/json' \
  --data "{\"completionToken\":\"${CONFLICT_TOKEN}\",\"password\":\"DifferentPass123\"}"
```

Expected: existing `EmailTaken` API/domain behavior. Verify login still succeeds with `ExistingPass123`; no password mutation occurs.

- [ ] **Step 7: Exercise concurrent completion.**

Seed one fresh completion token/payload, export `CONCURRENT_TOKEN` and its email, then:

```bash
for i in 1 2; do
  curl -sS -o "/tmp/data001-concurrent-${i}.out" -w "%{http_code}\n" \
    -X POST "$API_BASE/auth/registration/complete" \
    -H 'content-type: application/json' \
    --data "{\"completionToken\":\"${CONCURRENT_TOKEN}\",\"password\":\"${DATA001_PASSWORD}\"}" &
done
wait
```

Expected invariant: exactly one `users` row and no password mutation. If both requests peek before deletion, both may succeed through reconciliation; a request that only reaches Redis after deletion may return the normal expired-token response.

Remove `/tmp/data001-concurrent-*.out` after inspection.

- [ ] **Step 8: Verify password-reset semantics remain destructive.**

Run the existing password-reset start/verify/complete flow in the disposable environment and submit its completion token twice. Expected: first completion follows current behavior; second is expired because password reset still uses `GETDEL`.

- [ ] **Step 9: Verify eventual legal acceptance.**

For one successful tenant-scoped smoke email:

```bash
export CONSENT_USER_ID="$(psql "$MIGRATE_DATABASE_URL" -Atc "select id from users where email='${ROLLBACK_EMAIL}';")"
psql "$MIGRATE_DATABASE_URL" -P pager=off -c "
  select tenant_id, document_version_id, accepted_locale
  from agreement_acceptances
  where user_id='${CONSENT_USER_ID}'
    and tenant_id='${TENANT_ID}'
  order by accepted_at;
"
```

Expected after relay processing: rows for both `${CUSTOMER_TERMS_ID}` and `${PRIVACY_ID}` with accepted locale `vi`. Duplicate rows are acceptable; missing required version rows is a failure.

- [ ] **Step 10: Prove fault injection is fully reverted.**

```bash
psql "$MIGRATE_DATABASE_URL" -Atc "select tgname from pg_trigger where tgname='smoke_fail_registration_consent';"
redis-cli -u "$REDIS_URL" ACL GETUSER "$DATA001_REDIS_USER"
```

Expected: no smoke trigger; Redis user has `GETDEL` permission restored.

- [ ] **Step 11: Run one fresh final verification pass.**

```bash
pnpm check:no-tests \
  && pnpm check:module-cycles \
  && pnpm --filter=@booking/api lint \
  && pnpm --filter=@booking/api typecheck \
  && pnpm --filter=@booking/api build \
  && pnpm --filter=@booking/api check:rls
```

Expected: combined exit `0`.

- [ ] **Step 12: Review branch scope and prepare handoff.**

```bash
git status --short
git log --oneline --decorate main..HEAD
git diff --check main...HEAD
git diff --stat main...HEAD
```

Record exact static-check results and runtime smoke evidence in the PR/handoff. Mark every unexecuted runtime case `NEEDS VERIFICATION`. Do not merge or deploy without separate explicit authorization.
