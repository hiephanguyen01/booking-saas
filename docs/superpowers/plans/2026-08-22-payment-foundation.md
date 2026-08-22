# Payment Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the schema and resolution foundation that lets every new real payment remember the exact immutable gateway configuration revision used for checkout while legacy payments remain operable.

**Architecture:** Keep `Payment` as the transaction aggregate and `tenant_gateway_configs` as the credential/settings revision store. Gateway-config saves create successor rows instead of mutating historical secrets. New payment rows can point to a revision; webhook, reconciliation, and automatic-refund execution resolve adapters from that revision. Legacy rows with no revision use one centralized fallback path. PR1 deliberately keeps the existing provider-call-inside-checkout behavior; PR2 changes checkout orchestration.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 16/RLS, Zod contracts, AES-256-GCM credential storage, BullMQ reconciliation, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-08-22-payment-core-hardening-design.md`

## Global Constraints

- Do not add automated tests, test files, test scripts, or test runners. ADR 0005 requires static gates plus focused runtime smoke.
- Do not run `prisma migrate dev`. Edit `schema.prisma`, hand-write migration SQL, apply with `prisma:deploy`, then regenerate Prisma.
- All tenant-scoped DB work remains inside `TenantDbService.forTenant`; repository methods receive the transaction.
- No provider network call is newly added to a DB transaction. PR1 does not move the existing checkout call yet.
- Existing payment status semantics remain unchanged in PR1: `pending | succeeded | failed | expired`.
- Add separate checkout lifecycle storage as nullable compatibility data: `creating | ready | create_failed`. Existing rows remain `NULL`; current pre-PR2 checkout-created rows may be persisted as `ready` only after their provider handoff already exists.
- `gatewayConfigRevisionId` is nullable in the database for legacy rows and dev/mock payments. For a configured real gateway, every payment created after PR1 must store the active revision ID.
- Do not backfill guessed historical revisions.
- Do not expose credentials or revision IDs through public HTTP contracts in this PR.
- Do not delete inactive gateway revisions. They are needed for late webhook/reconciliation/refund/audit.
- Preserve the existing product rule: at most one base gateway is active tenant-wide; wallet gateways may be active in parallel, with at most one active revision per exact gateway.
- The database partial unique index enforces one active revision per `(tenant_id, gateway)`. Base-gateway-group exclusivity remains protected by one repository transaction plus a tenant-scoped advisory lock.
- Do not change payOS `baseUrl`, payOS order code, MoMo request IDs, exact amount equality, or multi-payment allocation here; those belong to PR2/PR3/PR4.
- No merge or deploy without separate authorization.

## File Map

**Schema / migration**
- Modify `apps/api/prisma/schema.prisma` — payment checkout state, captured amount, config revision relation; make gateway config rows revisionable.
- Create `apps/api/prisma/migrations/20260822022000_payment_foundation/migration.sql` — hand-written additive/payment-config revision migration and indexes.

**Gateway config revision store**
- Modify `apps/api/src/modules/payments/domain/ports/gateway-config-repository.port.ts` — add revision lookup; retain tenant-facing save semantics while documenting immutable behavior.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-gateway-config.repository.ts` — advisory lock + deactivate/create successor revision; settings changes also create revisions.
- Modify `apps/api/src/modules/payments/domain/entities/tenant-gateway-configs.entity.ts` — update comments/invariants only if needed; do not move DB locking into domain.

**Payment persistence / resolver**
- Modify `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts` — revision/captured/checkout-state fields, `findById`, captured amount persistence.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts` — map fields, support source-payment lookup, return revision data from admin-pool projections.
- Modify `apps/api/src/modules/payments/domain/ports/gateway-registry.port.ts` — explicit active-checkout and existing-payment resolution results.
- Modify `apps/api/src/modules/payments/infrastructure/gateway-registry.ts` — construct adapter from exact revision or centralized legacy fallback; log fallback without secrets.

**Consumers**
- Modify `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts` — minimal PR1 change: persist the selected revision and `checkoutState=ready` with the already-created provider handoff.
- Modify `apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.ts` — resolve exact payment revision and persist provider-confirmed captured amount.
- Modify `apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts` — resolve exact revision; persist captured amount on successful reconciliation.
- Modify `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts` — load `refund.paymentId` directly and use that payment's historical gateway revision/settings.

---

### Task 1: Add additive payment foundation schema and hand-written migration

**Files:** `apps/api/prisma/schema.prisma`, new migration SQL.

**Produces:**

```prisma
enum PaymentCheckoutState {
  creating
  ready
  create_failed

  @@map("payment_checkout_state")
}

model Payment {
  // existing fields...
  capturedAmount          BigInt?               @map("captured_amount")
  checkoutState           PaymentCheckoutState? @map("checkout_state")
  gatewayConfigRevisionId String?               @map("gateway_config_revision_id") @db.Uuid
  gatewayConfigRevision   TenantGatewayConfig?  @relation(fields: [gatewayConfigRevisionId], references: [id], onDelete: Restrict)

  @@index([gatewayConfigRevisionId])
}

model TenantGatewayConfig {
  // existing fields...
  payments Payment[]

  @@index([tenantId, gateway, environment])
  // remove @@unique([tenantId, gateway, environment])
}
```

- [ ] **Step 1: Locate the current `Payment` and `TenantGatewayConfig` schema blocks and preserve all existing mappings/indexes unrelated to this change.**

- [ ] **Step 2: Add `PaymentCheckoutState` and the three nullable payment columns.**

Keep `capturedAmount` nullable. Do not set it equal to expected `amount` during migration.

- [ ] **Step 3: Remove Prisma's `(tenantId, gateway, environment)` unique constraint and replace it with a normal index.**

The same environment may have multiple historical revisions.

- [ ] **Step 4: Hand-write `apps/api/prisma/migrations/20260822022000_payment_foundation/migration.sql`.**

The migration must:

```sql
CREATE TYPE "payment_checkout_state" AS ENUM ('creating', 'ready', 'create_failed');

ALTER TABLE "payments"
  ADD COLUMN "captured_amount" BIGINT,
  ADD COLUMN "checkout_state" "payment_checkout_state",
  ADD COLUMN "gateway_config_revision_id" UUID;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_gateway_config_revision_id_fkey"
  FOREIGN KEY ("gateway_config_revision_id")
  REFERENCES "tenant_gateway_configs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

Also drop the exact existing unique index/constraint for `(tenant_id, gateway, environment)`, add a non-unique lookup index, add `payments_gateway_config_revision_id_idx`, and add a partial unique index equivalent to:

```sql
CREATE UNIQUE INDEX "tenant_gateway_configs_one_active_revision_per_gateway"
ON "tenant_gateway_configs" ("tenant_id", "gateway")
WHERE "is_active" = true;
```

Do not create a new table, so no new RLS policy is required.

- [ ] **Step 5: Apply and regenerate against local Postgres.**

```bash
docker compose up -d postgres
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
```

Expected: migration applies once, Prisma generates, RLS checker remains green.

- [ ] **Step 6: Inspect DB constraints/indexes with `psql` or Prisma-supported local DB access.**

Verify:
- multiple inactive rows for the same tenant/gateway/environment are now structurally allowed;
- two active rows for the same tenant+gateway are rejected by the partial unique index;
- payment revision FK accepts `NULL` for legacy rows and rejects nonexistent revision IDs.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/prisma/schema.prisma \
  apps/api/prisma/migrations/20260822022000_payment_foundation/migration.sql
git commit -m "feat(payments): add payment revision foundation"
```

---

### Task 2: Make gateway configuration saves immutable and concurrency-safe

**Files:** gateway config port/repository/entity comments.

**Target repository API:**

```ts
export interface IGatewayConfigRepository {
  findActiveAll(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord[]>;
  findActiveBase(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord | null>;
  findByGateway(tx: PrismaTx, tenantId: string, gateway: GatewayKey): Promise<GatewayConfigRecord | null>;
  findById(tx: PrismaTx, tenantId: string, id: string): Promise<GatewayConfigRecord | null>;
  upsert(tx: PrismaTx, tenantId: string, data: UpsertGatewayConfigData): Promise<GatewayConfigRecord>;
  deactivate(tx: PrismaTx, tenantId: string, gateway?: GatewayKey): Promise<void>;
  updateSettings(tx: PrismaTx, tenantId: string, gateway: GatewayKey, settings: GatewayPaymentSettings): Promise<GatewayConfigRecord | null>;
}
```

`upsert` keeps its public name to minimize caller churn, but its persistence semantics become “create successor revision”.

- [ ] **Step 1: Add `findById(tx, tenantId, id)` with tenant scoping.**

Never fetch a revision by raw ID without the tenant condition.

- [ ] **Step 2: Add one private repository lock helper.**

Use repository-owned raw SQL inside the caller's tenant transaction:

```sql
SELECT pg_advisory_xact_lock(hashtext('gateway-config:' || <tenantId>))
```

This serializes all config saves for one tenant, including concurrent payOS/SePay base-gateway changes.

- [ ] **Step 3: Rewrite `upsert()` to lock, deactivate the relevant active scope, then `create()` a new row.**

Rules:
- wallet gateway save: deactivate active revisions of the same gateway only;
- base gateway save: deactivate every active non-wallet gateway for the tenant;
- encrypt incoming credentials once for the new row;
- set settings to supplied value or `defaultGatewayPaymentSettings(gateway)`;
- never UPDATE historical credentials/settings back to active.

- [ ] **Step 4: Rewrite `updateSettings()` as revision creation, not in-place update.**

Within the same advisory-locked transaction:
- read the active gateway record with decrypted credentials;
- return `null` if absent;
- deactivate the current active revision;
- create a successor row with the same gateway/environment/credentials and new settings;
- encrypt credentials into the new row;
- leave the previous row unchanged except `isActive=false`.

- [ ] **Step 5: Preserve `deactivate()` behavior.**

Explicit disabling may mutate only `isActive`; it must not delete or rewrite credentials/settings.

- [ ] **Step 6: Focused runtime smoke with real local DB transactions.**

Using the running API or a disposable one-off command that is not committed as a test file:
1. save payOS sandbox config A;
2. save payOS sandbox config B;
3. verify two rows exist, A inactive/B active, A encrypted payload unchanged;
4. update payment settings and verify a third revision is created;
5. issue concurrent base-gateway saves (payOS and SePay) and verify exactly one base config remains active;
6. keep MoMo active while changing payOS and verify both wallet/base rows can coexist.

Record the observed rows/counts in the PR description, not in a permanent test artifact.

- [ ] **Step 7: Verify static API checks and commit.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls

git add apps/api/src/modules/payments/domain/ports/gateway-config-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-gateway-config.repository.ts \
  apps/api/src/modules/payments/domain/entities/tenant-gateway-configs.entity.ts
git commit -m "refactor(payments): version gateway configurations"
```

---

### Task 3: Extend payment persistence for revisions, checkout state, and captured amount

**Files:** payment repository port + Prisma implementation.

**Produces:**

```ts
export interface PaymentRecord {
  // existing fields
  capturedAmount: bigint | null;
  gatewayConfigRevisionId: string | null;
  checkoutState: PaymentCheckoutState | null;
}

export interface PaymentRef {
  // existing fields
  capturedAmount: bigint | null;
  gatewayConfigRevisionId: string | null;
}
```

`CreatePaymentData` adds optional:

```ts
capturedAmount?: bigint | null;
gatewayConfigRevisionId?: string | null;
checkoutState?: PaymentCheckoutState | null;
```

`IPaymentRepository` adds:

```ts
findById(tx: PrismaTx, id: string): Promise<PaymentRecord | null>;
```

`markSucceeded` gateway data adds:

```ts
capturedAmount: bigint;
```

- [ ] **Step 1: Update port types using Prisma's generated `PaymentCheckoutState` type.**

Do not expose this enum through shared HTTP contracts yet.

- [ ] **Step 2: Map all three fields in `toRecord()` and `toRef()`.**

- [ ] **Step 3: Add `findById()` scoped through the tenant transaction.**

- [ ] **Step 4: Extend `create()` to persist revision and checkout-state data.**

- [ ] **Step 5: Extend `markSucceeded()` atomic SQL to write `captured_amount`.**

The guarded transition remains atomic. Store the exact provider-reported amount used for the success decision. Do not overwrite a succeeded row on duplicate delivery.

- [ ] **Step 6: Add `gateway_config_revision_id` and `captured_amount` to admin-pool raw projections used by `findStalePending()` and `findSucceededNeedingRecovery()` where needed by the returned `PaymentRef`.**

- [ ] **Step 7: Verify and commit.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck

git add apps/api/src/modules/payments/domain/ports/payment-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts
git commit -m "refactor(payments): persist gateway revision metadata"
```

---

### Task 4: Split gateway resolution into active-checkout and historical-payment paths

**Files:** gateway registry port + implementation.

**Produces:**

```ts
export interface ResolvedGateway {
  gateway: PaymentGatewayPort;
  configRevisionId: string | null;
  settings: GatewayPaymentSettings;
}

export interface PaymentGatewayResolutionInput {
  id: string;
  tenantId: string;
  gateway: GatewayKey;
  gatewayConfigRevisionId: string | null;
}

export interface GatewayRegistryPort {
  statelessByKey(key: GatewayKey): PaymentGatewayPort;
  resolveActiveForCheckout(
    tx: PrismaTx,
    tenantId: string,
    gateway?: GatewayKey,
  ): Promise<ResolvedGateway>;
  resolveForPayment(
    tx: PrismaTx,
    payment: PaymentGatewayResolutionInput,
  ): Promise<ResolvedGateway>;
  // keep resolveForTenant temporarily only if an unmigrated PR1 caller still needs it;
  // remove once all current callers are switched.
}
```

- [ ] **Step 1: Extract one private adapter-construction method from `resolveForTenant()`.**

It receives a validated/decrypted `GatewayConfigRecord`; provider constructors remain infrastructure-only.

- [ ] **Step 2: Implement `resolveActiveForCheckout()`.**

For configured real gateways return adapter + exact config ID + settings. For allowed dev mock fallback return:

```ts
{ gateway: this.mock, configRevisionId: null, settings: DEFAULT_GATEWAY_PAYMENT_SETTINGS }
```

- [ ] **Step 3: Implement `resolveForPayment()`.**

Rules:
1. if `payment.gatewayConfigRevisionId` exists, call `configs.findById(tx, payment.tenantId, id)`;
2. reject if the row is missing or belongs to a different gateway rather than silently switching credentials;
3. if revision ID is `null`, use the legacy `findByGateway()` fallback;
4. emit one warning/log signal named/text-searchable as `legacy_payment_gateway_resolution` including only payment ID, tenant ID, and gateway; never credentials/settings values;
5. mock remains valid only under existing dev/mock rules.

Use Nest `Logger` in the infrastructure registry, not a domain logger.

- [ ] **Step 4: Keep compatibility narrow.**

If `resolveForTenant()` remains for compile compatibility, implement it as a thin call to active-config resolution and mark it temporary in comments. Do not add a second legacy fallback path.

- [ ] **Step 5: Verify and commit.**

```bash
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck

git add apps/api/src/modules/payments/domain/ports/gateway-registry.port.ts \
  apps/api/src/modules/payments/infrastructure/gateway-registry.ts
git commit -m "refactor(payments): resolve historical gateway revisions"
```

---

### Task 5: Wire revision-aware resolution into checkout, webhook, reconciliation, and automatic refunds

**Files:** four consumers listed in File Map.

- [ ] **Step 1: Minimal checkout change only.**

Keep the current PR1 orchestration order intact. Replace direct active adapter resolution with `resolveActiveForCheckout()`. After provider create succeeds, persist:

```ts
gatewayConfigRevisionId: resolved.configRevisionId,
checkoutState: 'ready',
```

A configured real gateway must not create a payment with a null revision ID. Dev/mock may remain null.

Do not move `gateway.createPayment()` outside the transaction here; PR2 owns that behavioral change.

- [ ] **Step 2: Change webhook adapter resolution to `resolveForPayment()`.**

The `PaymentRef` found by gateway reference carries the historical revision ID. Signature verification therefore uses the exact old credential revision after rotation.

Pass `capturedAmount: v.amountVnd` into `markSucceeded()`.

Keep the PR1 amount rule unchanged (`paid >= expected`); exact equality is PR2.

- [ ] **Step 3: Change reconciliation adapter resolution to `resolveForPayment()`.**

Continue resolving inside a short RLS transaction and perform provider network I/O outside it. On successful reconciliation pass `capturedAmount: status.amountVnd` into the guarded success write.

- [ ] **Step 4: Fix automatic refund source-payment lookup.**

Replace:

```ts
payments.findSucceededByBooking(tx, refund.bookingId)
```

with:

```ts
payments.findById(tx, refund.paymentId)
```

Require the loaded payment to be `succeeded` and to match the refund entity's payment ID. This is not yet multi-payment planning; it only makes already-created refund intents execute against their actual source payment.

Resolve gateway and refund settings through `resolveForPayment()` so historical settings and credentials travel together. Remove the separate “current config by gateway” settings lookup from this use case.

- [ ] **Step 5: Runtime credential-rotation smoke.**

With local DB and mockable/sandbox-capable provider data:
1. create a payment row referencing revision A;
2. rotate the tenant gateway to revision B;
3. exercise `resolveForPayment()` for that payment and confirm revision A is selected;
4. create a synthetic legacy payment with null revision and confirm the centralized fallback selects the current config and emits the legacy signal;
5. verify an automatic refund intent loads `refund.paymentId`, not latest booking payment.

Do not commit a test/smoke script; use a disposable command or app flow and record observations.

- [ ] **Step 6: Run full static gate.**

```bash
pnpm check:no-tests && \
pnpm check:module-cycles && \
pnpm check:frontend-structure && \
pnpm check:theme-tokens && \
pnpm check:tenant-surfaces && \
pnpm --filter=@booking/storefront security && \
pnpm turbo lint typecheck build && \
pnpm --filter=@booking/api check:rls
```

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.ts \
  apps/api/src/modules/payments/infrastructure/reconciliation.worker.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts
git commit -m "refactor(payments): bind lifecycle to gateway revisions"
```

---

### Task 6: PR1 completion review

- [ ] **Step 1: Inspect branch diff for scope.**

Only payment schema/migration, revision persistence/resolution, and the four consumers above should change. No provider protocol hardening or storefront changes belong here.

- [ ] **Step 2: Confirm backward compatibility.**

Verify:
- legacy payment rows remain valid with null revision/captured/checkout fields;
- existing payment history/public responses are unchanged;
- inactive config revisions are not returned as active payment options;
- webhook/reconciliation/refund can resolve old revisions;
- dev mock checkout remains possible under existing env gates.

- [ ] **Step 3: Confirm migration discipline.**

```bash
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
```

No `prisma migrate dev` output or generated migration should appear in the diff.

- [ ] **Step 4: Create a draft PR only after local verification succeeds.**

Suggested title:

```text
refactor(payments): add immutable gateway revision foundation
```

PR description must include:
- migration/index behavior;
- gateway rotation runtime-smoke observations;
- legacy fallback behavior;
- exact static commands run and their outcomes;
- explicit note that checkout network I/O is intentionally unchanged until PR2.
