# Payment Provider / Routing / Refund Policy Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate provider credential connections, explicit checkout-method routing, and tenant refund policy so SePay, PayOS, MoMo and ZaloPay can stay connected simultaneously while every checkout method resolves deterministically to one provider and every new Payment freezes its refund behavior.

**Architecture:** Keep immutable `TenantGatewayConfig` revisions as the credential/history store, add a tenant-scoped route table for current method → provider choices, and add a tenant-scoped refund-policy table for current policy. Checkout Phase A resolves an explicit route, records the exact active gateway revision, and snapshots refund policy in the same tenant transaction before provider I/O. Payment lifecycle work continues to resolve the recorded gateway revision; legacy Payments with no refund snapshot fall back to their historical gateway settings during the compatibility release.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 16 with FORCE RLS, Zod contracts, AES-256-GCM credential storage, React Router 8 SSR dashboard, Vitest use-case tests + repository architecture guards, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-08-23-payment-provider-routing-separation-design.md`

## Global Constraints

- Provider connection, payment-method routing and refund policy are separate concerns. `TenantGatewayConfig.settings` remains readable only for legacy refund compatibility and is not authoritative for new routing/refund writes.
- A tenant may have active SePay, PayOS, MoMo and ZaloPay revisions simultaneously; there is at most one active revision per exact `(tenant_id, gateway)`.
- Every enabled customer-facing method has zero or one configured route. There is no implicit first-provider selection, weighted routing, provider priority list, or cross-provider failover.
- If a provider create call is ambiguous/retryable, retries stay on the same durable Payment/provider identity. Never create a second payment on another gateway automatically.
- Checkout Phase A must persist `gateway`, exact `gatewayConfigRevisionId`, payment method, `refundStrategySnapshot` and `manualRefundSlaHoursSnapshot` before provider I/O. Route changes and credential rotations after that point must not redirect the Payment.
- New Payment refund snapshots are all-or-nothing. A half-populated snapshot is an invariant violation and fails closed.
- Legacy Payment refund resolution order is: complete Payment snapshot → exact historical gateway revision settings → existing pre-foundation legacy gateway fallback. Do not backfill guessed Payment snapshots.
- Keep `TenantGatewayConfig.settings` and historical gateway revisions through this release. Do not delete inactive revisions and do not drop the settings JSON column.
- All payment-configuration writes serialize on the exact existing advisory-lock namespace `gateway-config:<tenantId>`.
- Every tenant-scoped database operation stays inside `TenantDbService.forTenant`; repositories receive the transaction. Never open a provider network call inside the tenant transaction.
- Every new tenant-scoped table has `tenant_id UUID NOT NULL`, RLS enabled, FORCE RLS, the standard `tenant_isolation` policy, and grants to `app_user` / `app_admin`.
- Hand-write migrations. Do not run `prisma migrate dev`; apply with `pnpm --filter=@booking/api prisma:deploy`, then regenerate Prisma.
- Repository hard rule ADR 0009 applies over the spec's generic testing section: exactly one adjacent `*.use-case.spec.ts` per use case plus architecture guards. Do not add contract, repository, controller, frontend, integration/e2e, browser-driver or second-runner tests.
- Dashboard authenticated reads/writes remain React Router loader/action server-to-server calls; never fetch the API directly from browser components.
- Preserve provider webhook signature algorithms, refund provider protocols, PayOS/MoMo/ZaloPay/SePay adapter behavior, durable checkout idempotency, amount semantics and existing payment status semantics.
- No production deployment and no merge to `main` without separate explicit authorization.

## File Map

**Contracts**
- Modify `packages/contracts/src/contracts/payment.ts` — route/refund-policy schemas and types, PayOS dashboard form schema, capability validation, provider-config input no longer owns current checkout/refund settings.

**Schema / migration**
- Modify `apps/api/prisma/schema.prisma` — `TenantPaymentMethodRoute`, `TenantRefundPolicy`, Payment refund snapshot columns and Tenant relations.
- Create `apps/api/prisma/migrations/20260823034000_payment_provider_routing_separation/migration.sql` — additive tables/columns, constraints, RLS/FORCE RLS and deterministic compatibility backfill.

**Shared payment-configuration serialization**
- Create `apps/api/src/modules/payments/domain/ports/payment-configuration-lock.port.ts` — hexagonal lock port using the existing namespace.
- Create `apps/api/src/modules/payments/infrastructure/postgres-payment-configuration-lock.ts` — PostgreSQL advisory-lock adapter.

**Provider connection store**
- Modify `apps/api/src/modules/payments/domain/ports/gateway-config-repository.port.ts` — exact active-provider lookup; retain legacy revision lookup.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-gateway-config.repository.ts` — same-provider-only rotation/deactivation under the shared lock; remove base/wallet exclusivity.
- Modify gateway-config use-case specs where behavior changes.

**Explicit method routing**
- Create `apps/api/src/modules/payments/domain/ports/payment-method-route-repository.port.ts`.
- Create `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment-method-route.repository.ts`.
- Create `apps/api/src/modules/payments/application/use-cases/get-payment-routing.use-case.ts` and `.spec.ts`.
- Create `apps/api/src/modules/payments/application/use-cases/update-payment-routing.use-case.ts` and `.spec.ts`.

**Tenant refund policy**
- Create `apps/api/src/modules/payments/domain/ports/refund-policy-repository.port.ts`.
- Create `apps/api/src/modules/payments/infrastructure/repositories/prisma-refund-policy.repository.ts`.
- Create `apps/api/src/modules/payments/application/use-cases/get-refund-policy.use-case.ts` and `.spec.ts`.
- Create `apps/api/src/modules/payments/application/use-cases/update-refund-policy.use-case.ts` and `.spec.ts`.
- Create `apps/api/src/modules/payments/domain/refund-policy-resolution.ts` — pure Payment-snapshot/legacy-policy resolver.

**Gateway resolution / checkout / public options / refunds**
- Modify `apps/api/src/modules/payments/domain/ports/gateway-registry.port.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/gateway-registry.ts`.
- Modify `apps/api/src/modules/payments/domain/ports/payment-repository.port.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts`.
- Modify `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts` and `.spec.ts`.
- Modify `apps/api/src/modules/payments/application/use-cases/get-public-payment-options.use-case.ts` and `.spec.ts`.
- Modify `apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts` and `.spec.ts`.
- Modify `apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts` and `.spec.ts`.

**HTTP / wiring**
- Create `apps/api/src/modules/payments/infrastructure/http/tenant-payment-configuration.controller.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/http/dto/payments.dto.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/http/payments.module.ts`.
- Modify `apps/api/src/modules/payments/infrastructure/http/tenant-gateway.controller.ts` only for removal of the old combined settings write after dashboard migration.

**Dashboard**
- Modify `apps/dashboard/app/constants/api-paths.ts`.
- Modify `apps/dashboard/app/features/tenant/server/settings-loader.server.ts`.
- Modify `apps/dashboard/app/features/tenant/server/settings-actions.server.ts`.
- Modify `apps/dashboard/app/features/tenant/components/settings/payment-gateway-card.tsx` — four independent provider cards.
- Create `apps/dashboard/app/features/tenant/components/settings/payos-gateway-card.tsx`.
- Create `apps/dashboard/app/features/tenant/components/settings/checkout-method-settings-card.tsx`.
- Create `apps/dashboard/app/features/tenant/components/settings/refund-policy-card.tsx`.
- Modify `apps/dashboard/app/routes/tenant/settings.tsx`.
- Delete `apps/dashboard/app/features/tenant/components/settings/payment-method-settings-card.tsx` after its responsibilities move to the two new cards.

**Compatibility cleanup**
- Delete `apps/api/src/modules/payments/domain/method-routing.ts` after all production callers use explicit routes.
- Delete `apps/api/src/modules/payments/application/use-cases/update-gateway-payment-settings.use-case.ts` and its adjacent spec after the new route/refund APIs are live in dashboard.
- Remove old `gatewayConfigSettings` dashboard path/action wiring; retain legacy `settings` storage and historical read behavior.

---

### Task 1: Define route and refund-policy contracts without extending the test surface

**Files:** `packages/contracts/src/contracts/payment.ts`.

**Produces:**

```ts
export const paymentMethodRouteSchema = z
  .object({
    method: customerPaymentMethodSchema,
    gateway: gatewayKeySchema,
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((route, ctx) => {
    if (!GATEWAY_SUPPORTED_METHODS[route.gateway].includes(route.method)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gateway'],
        message: `${route.gateway} does not support ${route.method}`,
      });
    }
  });

export const paymentRoutingInputSchema = z
  .object({ routes: z.array(paymentMethodRouteSchema).max(5) })
  .strict()
  .superRefine(({ routes }, ctx) => {
    const seen = new Set<CustomerPaymentMethod>();
    routes.forEach((route, index) => {
      if (seen.has(route.method)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['routes', index, 'method'],
          message: `Duplicate route for ${route.method}`,
        });
      }
      seen.add(route.method);
    });
  });

export const paymentRoutingResponseSchema = z.object({
  routes: z.array(paymentMethodRouteSchema),
});

export const tenantRefundPolicySchema = z
  .object({
    refundStrategy: refundStrategySchema,
    manualRefundSlaHours: z.number().int().min(1).max(720),
  })
  .strict();

export const updateTenantRefundPolicyInputSchema = tenantRefundPolicySchema;
```

- [ ] **Step 1: Add the route schemas/types above immediately after the capability map.** Keep `GATEWAY_SUPPORTED_METHODS` as the single provider-capability authority.

- [ ] **Step 2: Add `tenantRefundPolicySchema`, `UpdateTenantRefundPolicyInput` and response type aliases from the same schema.** Use the existing `refundStrategySchema`; do not introduce another strategy enum.

- [ ] **Step 3: Add `payosGatewaySettingsFormSchema`.** It validates `environment`, `clientId`, `apiKey`, and `checksumKey` with the same limits as `payosGatewayConfigInputSchema`, so dashboard no longer routes PayOS input through SePay parsing.

- [ ] **Step 4: Stop accepting current route/refund settings as part of new provider credential writes.** Replace the `withOptionalSettings(...)` discriminated-union members with the five provider credential schemas directly. Keep `GatewayPaymentSettings`, legacy defaults, and `gatewayConfigResponseSchema.settings` during the compatibility release because historical Payment resolution still needs stored settings and older rollback code may read the response.

- [ ] **Step 5: Do not create a contracts test file.** ADR 0009 forbids it. Exercise duplicate/capability validation through `UpdatePaymentRoutingUseCase`'s one allowed adjacent use-case spec in Task 4.

- [ ] **Step 6: Run contract/package type verification.**

```bash
pnpm --filter=@booking/contracts typecheck
```

Expected: exit 0; no new test project or runner.

- [ ] **Step 7: Commit.**

```bash
git add packages/contracts/src/contracts/payment.ts
git commit -m "refactor(payments): separate routing and refund contracts"
```

---

### Task 2: Add additive route/refund schema, snapshots, RLS and deterministic backfill

**Files:** `apps/api/prisma/schema.prisma`, new migration SQL.

**Produces:**

```prisma
model TenantPaymentMethodRoute {
  id        String         @id @default(uuid(7)) @db.Uuid
  tenantId  String         @map("tenant_id") @db.Uuid
  method    String
  gateway   PaymentGateway
  enabled   Boolean        @default(true)
  createdAt DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)
  tenant    Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, method])
  @@index([tenantId, gateway])
  @@map("tenant_payment_method_routes")
}

model TenantRefundPolicy {
  tenantId             String   @id @map("tenant_id") @db.Uuid
  refundStrategy       String   @map("refund_strategy")
  manualRefundSlaHours Int      @map("manual_refund_sla_hours")
  updatedBy            String?  @map("updated_by") @db.Uuid
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  tenant               Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_refund_policies")
}
```

`Payment` adds:

```prisma
refundStrategySnapshot       String? @map("refund_strategy_snapshot")
manualRefundSlaHoursSnapshot Int?    @map("manual_refund_sla_hours_snapshot")
```

- [ ] **Step 1: Add both models and Tenant relation arrays without restructuring unrelated Prisma models.** Add the two nullable snapshot fields to `Payment`; do not add a default to historical Payment rows.

- [ ] **Step 2: Hand-write `apps/api/prisma/migrations/20260823034000_payment_provider_routing_separation/migration.sql`.** Create both tables, foreign keys, unique/indexes and Payment columns. Add exact CHECK constraints:

```sql
ALTER TABLE "tenant_payment_method_routes"
  ADD CONSTRAINT "tenant_payment_method_routes_method_check"
  CHECK ("method" IN ('bank_transfer','napas_qr','international_card','momo_wallet','zalopay_wallet')),
  ADD CONSTRAINT "tenant_payment_method_routes_gateway_check"
  CHECK ("gateway"::text IN ('sepay','payos','momo','zalopay','mock'));

ALTER TABLE "tenant_refund_policies"
  ADD CONSTRAINT "tenant_refund_policies_strategy_check"
  CHECK ("refund_strategy" IN ('manual','automatic_preferred')),
  ADD CONSTRAINT "tenant_refund_policies_sla_check"
  CHECK ("manual_refund_sla_hours" BETWEEN 1 AND 720);
```

- [ ] **Step 3: Enable and FORCE RLS on both tables using repository convention.**

```sql
ALTER TABLE "tenant_payment_method_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_payment_method_routes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_payment_method_routes"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_payment_method_routes" TO app_user, app_admin;

ALTER TABLE "tenant_refund_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_refund_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_refund_policies"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_refund_policies" TO app_user, app_admin;
```

- [ ] **Step 4: Backfill routes with the legacy selection semantics, not an arbitrary new preference.** For each tenant's active configs, wallet methods map only to their exact active wallet gateway when legacy `settings.enabledMethods` contains the method. For non-wallet methods, use the single active non-wallet/base config only when both legacy settings and the capability map permit it. The SQL must insert at most one `(tenant_id, method)` row and ignore capability-invalid legacy claims.

- [ ] **Step 5: Backfill one current refund-policy row per tenant deterministically.** Precedence is active non-wallet/base config settings → active MoMo settings → active ZaloPay settings → `manual` / `72`. Validate/coalesce malformed legacy JSON into the safe default rather than writing values that violate the new CHECK constraints.

- [ ] **Step 6: Do not backfill the Payment snapshot columns.** Historical rows stay `(NULL, NULL)` and use historical settings at refund time.

- [ ] **Step 7: Apply locally and regenerate Prisma.**

```bash
docker compose up -d postgres
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
pnpm test:arch
```

Expected: migration applies once; Prisma generation succeeds; RLS coverage guard recognizes both tables.

- [ ] **Step 8: Run a disposable database smoke, not a committed repository test.** Verify duplicate `(tenant_id, method)` insertion fails, cross-tenant reads under `app_user` are hidden, a half-populated Payment snapshot is structurally possible only for compatibility detection, and no existing Payment row was rewritten.

- [ ] **Step 9: Commit.**

```bash
git add apps/api/prisma/schema.prisma \
  apps/api/prisma/migrations/20260823034000_payment_provider_routing_separation/migration.sql
git commit -m "feat(payments): add routing and refund policy storage"
```

---

### Task 3: Introduce one payment-configuration lock port and make providers independent

**Files:** new lock port/adapter, gateway-config port/repository, gateway-config use-case specs, module wiring.

**Interfaces:**

```ts
export const PAYMENT_CONFIGURATION_LOCK = Symbol('PAYMENT_CONFIGURATION_LOCK');

export interface PaymentConfigurationLockPort {
  acquire(tx: PrismaTx, tenantId: string): Promise<void>;
}
```

Adapter implementation:

```ts
await tx.$executeRaw(
  Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('gateway-config:' || ${tenantId}))`,
);
```

Gateway repository adds:

```ts
findActiveByGateway(
  tx: PrismaTx,
  tenantId: string,
  gateway: GatewayKey,
): Promise<GatewayConfigRecord | null>;
```

- [ ] **Step 1: Add the lock port and PostgreSQL adapter.** This is a port+adapter, not an application service; it exists so route/refund use cases can acquire the same lock before cross-repository validation.

- [ ] **Step 2: Register the lock adapter in `PaymentsModule` and inject it into `PrismaGatewayConfigRepository`.** Delete the repository-private raw-SQL helper to prevent multiple namespace implementations.

- [ ] **Step 3: Add failing behavior cases to the existing `upsert-gateway-config.use-case.spec.ts` before production edits.** The important externally observable assertion is that saving PayOS while SePay is already active does not imply SePay deactivation; keep repository-specific SQL details out of the unit test.

- [ ] **Step 4: Run the focused use-case spec and verify RED.**

```bash
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/upsert-gateway-config.use-case.spec.ts
```

Expected: the new coexistence expectation fails against the old base-gateway behavior/fake port contract.

- [ ] **Step 5: Change `PrismaGatewayConfigRepository.upsert()` to acquire the shared lock and deactivate only active rows where `{ tenantId, gateway: data.gateway }`.** Never deactivate another gateway. Continue creating an immutable successor revision and preserving compatible legacy settings payload for historical fallback.

- [ ] **Step 6: Make `deactivate()` acquire the same shared lock before changing `isActive`.** Gateway-specific disable touches only that gateway; no-gateway maintenance disable-all stays supported and leaves route rows untouched.

- [ ] **Step 7: Implement `findActiveByGateway()` as exact `(tenantId, gateway, isActive:true)` lookup.** Keep `findByGateway()` only for pre-foundation legacy fallback; `findActiveBase()` remains temporarily until Tasks 6–8 remove every caller.

- [ ] **Step 8: Run the focused use-case spec and verify GREEN, then run the related deactivate/get gateway specs.**

```bash
pnpm exec vitest run --project api \
  apps/api/src/modules/payments/application/use-cases/upsert-gateway-config.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/deactivate-gateway.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/get-gateway-config.use-case.spec.ts
```

Expected: all selected specs pass.

- [ ] **Step 9: Runtime-smoke the real repository against local Postgres.** Save SePay then PayOS, verify both active; rotate PayOS, verify only old PayOS becomes inactive; leave MoMo/ZaloPay active; issue concurrent same-gateway saves and verify the partial unique active-revision invariant still holds.

- [ ] **Step 10: Commit.**

```bash
git add apps/api/src/modules/payments/domain/ports/payment-configuration-lock.port.ts \
  apps/api/src/modules/payments/infrastructure/postgres-payment-configuration-lock.ts \
  apps/api/src/modules/payments/domain/ports/gateway-config-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-gateway-config.repository.ts \
  apps/api/src/modules/payments/application/use-cases/upsert-gateway-config.use-case.spec.ts \
  apps/api/src/modules/payments/infrastructure/http/payments.module.ts
git commit -m "refactor(payments): make provider connections independent"
```

---

### Task 4: Add atomic payment-routing repository and tenant GET/PUT use cases

**Files:** route port/repository, two use cases + adjacent specs, HTTP DTO/controller/module wiring.

**Interfaces:**

```ts
export interface PaymentMethodRoute {
  method: CustomerPaymentMethod;
  gateway: GatewayKey;
  enabled: boolean;
}

export interface IPaymentMethodRouteRepository {
  list(tx: PrismaTx, tenantId: string): Promise<PaymentMethodRoute[]>;
  findEnabledByMethod(
    tx: PrismaTx,
    tenantId: string,
    method: CustomerPaymentMethod,
  ): Promise<PaymentMethodRoute | null>;
  replaceAll(
    tx: PrismaTx,
    tenantId: string,
    routes: PaymentMethodRoute[],
  ): Promise<PaymentMethodRoute[]>;
}
```

- [ ] **Step 1: Create `GetPaymentRoutingUseCase` and its required adjacent spec first.** RED case: it returns stored routes in contract method order and never exposes credentials/settings.

- [ ] **Step 2: Create `UpdatePaymentRoutingUseCase` and its required adjacent spec first.** Its tests cover, through the use case, the contract behaviors that ADR 0009 prevents testing in a separate contracts suite: duplicate method rejection, unsupported method/provider rejection, enabled inactive-provider rejection, disabled inactive-provider acceptance, empty replacement, zero-enabled replacement, mock guard, and all five valid real-provider routes.

- [ ] **Step 3: Run both new specs and verify RED because the ports/use cases are not implemented yet.**

```bash
pnpm exec vitest run --project api \
  apps/api/src/modules/payments/application/use-cases/get-payment-routing.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/update-payment-routing.use-case.spec.ts
```

- [ ] **Step 4: Implement `PrismaPaymentMethodRouteRepository`.** `list` is tenant-scoped. `findEnabledByMethod` filters `{ tenantId, method, enabled:true }`. `replaceAll` performs a full atomic replacement inside the caller's tenant transaction: delete omitted rows, upsert submitted rows by `(tenantId, method)`, retain gateway on submitted disabled rows, and return current rows.

- [ ] **Step 5: Implement `UpdatePaymentRoutingUseCase` with the lock acquired before provider validation.** Inside one `TenantDbService.forTenant` callback:

```ts
await configurationLock.acquire(tx, tenantId);
const parsed = paymentRoutingInputSchema.parse(input);
const active = await configs.findActiveAll(tx, tenantId);
const activeKeys = new Set(active.map((config) => config.gateway));
for (const route of parsed.routes) {
  if (route.enabled && !activeKeys.has(route.gateway)) throw new PaymentRoutingProviderInactive();
  if (route.gateway === 'mock') Payment.assertGatewayAcceptsMockConfiguration(...);
}
return routes.replaceAll(tx, tenantId, parsed.routes);
```

Use the project's existing mock-payment environment rule rather than inventing a second environment flag. Disabled routes may point to inactive providers.

- [ ] **Step 6: Add `GET /tenant/payment-routing` and `PUT /tenant/payment-routing` to a new `TenantPaymentConfigurationController`.** Both require `tenant.settings.manage`; PUT also uses `RequireActiveSubscriptionGuard`. Use Zod-backed DTO/validation and return the provider-neutral route response.

- [ ] **Step 7: Wire repository token, both use cases and controller in `PaymentsModule`.** No controller tests.

- [ ] **Step 8: Run the two use-case specs and verify GREEN, then API typecheck.**

```bash
pnpm exec vitest run --project api \
  apps/api/src/modules/payments/application/use-cases/get-payment-routing.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/update-payment-routing.use-case.spec.ts
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 9: Runtime-smoke the HTTP API.** Confirm a full five-route PUT is returned by GET; an omitted method disappears; a disabled row survives with its gateway; an enabled inactive-provider route is rejected while that provider is disabled; concurrent provider disable vs route update serializes on the shared lock.

- [ ] **Step 10: Commit.**

```bash
git add apps/api/src/modules/payments/domain/ports/payment-method-route-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-payment-method-route.repository.ts \
  apps/api/src/modules/payments/application/use-cases/get-payment-routing.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/get-payment-routing.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/update-payment-routing.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/update-payment-routing.use-case.spec.ts \
  apps/api/src/modules/payments/infrastructure/http/tenant-payment-configuration.controller.ts \
  apps/api/src/modules/payments/infrastructure/http/dto/payments.dto.ts \
  apps/api/src/modules/payments/infrastructure/http/payments.module.ts
git commit -m "feat(payments): add explicit method routing"
```

---

### Task 5: Add tenant refund-policy repository and GET/PUT use cases

**Files:** refund-policy port/repository, get/update use cases + specs, same configuration controller/module.

**Interfaces:**

```ts
export interface TenantRefundPolicyRecord {
  refundStrategy: RefundStrategy;
  manualRefundSlaHours: number;
}

export interface IRefundPolicyRepository {
  get(tx: PrismaTx, tenantId: string): Promise<TenantRefundPolicyRecord>;
  upsert(
    tx: PrismaTx,
    tenantId: string,
    policy: TenantRefundPolicyRecord,
    actorId: string,
  ): Promise<TenantRefundPolicyRecord>;
}
```

- [ ] **Step 1: Write `GetRefundPolicyUseCase` spec first.** RED cases: missing DB row returns exactly `{ refundStrategy:'manual', manualRefundSlaHours:72 }`; stored row returns its values.

- [ ] **Step 2: Write `UpdateRefundPolicyUseCase` spec first.** RED cases: accepts valid manual/automatic-preferred policies, rejects SLA outside 1..720 through `updateTenantRefundPolicyInputSchema`, passes the authenticated actor ID, and acquires the shared configuration lock before write.

- [ ] **Step 3: Run both specs and verify RED.**

```bash
pnpm exec vitest run --project api \
  apps/api/src/modules/payments/application/use-cases/get-refund-policy.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/update-refund-policy.use-case.spec.ts
```

- [ ] **Step 4: Implement the Prisma repository.** `get` returns the safe default on no row; `upsert` uses tenant primary key and updates `updatedBy`. Do not read or write gateway credentials/settings.

- [ ] **Step 5: Implement update orchestration under the exact shared lock.** Parse input, `forTenant`, acquire lock, then upsert. The lock intentionally serializes with provider changes and routing changes for one coherent payment configuration state.

- [ ] **Step 6: Add `GET /tenant/refund-policy` and `PUT /tenant/refund-policy` to `TenantPaymentConfigurationController`.** Require `tenant.settings.manage`; PUT requires active subscription and passes `CurrentPrincipal.userId` to the use case.

- [ ] **Step 7: Wire repository/use cases and run GREEN.**

```bash
pnpm exec vitest run --project api \
  apps/api/src/modules/payments/application/use-cases/get-refund-policy.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/update-refund-policy.use-case.spec.ts
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 8: Runtime-smoke default/read/update behavior and verify a policy update never creates a gateway credential revision.**

- [ ] **Step 9: Commit.**

```bash
git add apps/api/src/modules/payments/domain/ports/refund-policy-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-refund-policy.repository.ts \
  apps/api/src/modules/payments/application/use-cases/get-refund-policy.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/get-refund-policy.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/update-refund-policy.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/update-refund-policy.use-case.spec.ts \
  apps/api/src/modules/payments/infrastructure/http/tenant-payment-configuration.controller.ts \
  apps/api/src/modules/payments/infrastructure/http/payments.module.ts
git commit -m "feat(payments): add tenant refund policy"
```

---

### Task 6: Replace base/wallet checkout resolution with explicit route resolution

**Files:** gateway registry port/implementation; gateway config port/repository; existing checkout/public-option specs only as necessary for the changed seam.

**Target registry API:**

```ts
resolveActiveForMethod(
  tx: PrismaTx,
  tenantId: string,
  method: CustomerPaymentMethod,
): Promise<ResolvedGateway>;

resolveForPayment(
  tx: PrismaTx,
  payment: PaymentGatewayResolutionInput,
): Promise<ResolvedGateway>;
```

- [ ] **Step 1: Add a failing routing case to `checkout.use-case.spec.ts` before changing the registry.** Configure both SePay and PayOS as connected, route `bank_transfer -> payos`, and assert the created durable Payment is PayOS. The old `pickConfigForMethod()`/base selection should make the new assertion fail.

- [ ] **Step 2: Run the checkout spec and verify RED for the explicit-provider assertion.**

```bash
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/checkout.use-case.spec.ts
```

- [ ] **Step 3: Add route-repository injection to `GatewayRegistry` and implement `resolveActiveForMethod()`.** Exact algorithm:
  1. find enabled route by method;
  2. throw `PaymentMethodUnavailable` if absent;
  3. verify `GATEWAY_SUPPORTED_METHODS[route.gateway]` contains method, else throw a routing-configuration invariant error;
  4. enforce the existing mock-payment environment guard when gateway is `mock`;
  5. load `configs.findActiveByGateway(tx, tenantId, route.gateway)`;
  6. throw unavailable/configuration error if no active config;
  7. construct the adapter from that exact config and return its revision ID.

- [ ] **Step 4: Keep `resolveForPayment()` historical behavior.** Exact `gatewayConfigRevisionId` lookup remains first. Legacy no-revision lookup remains scoped to the Payment's gateway via `findByGateway`. `ResolvedGateway.settings` remains available only for legacy refund-policy fallback.

- [ ] **Step 5: Remove `resolveForTenant()`; repository search shows no production callers.** Remove `resolveActiveForCheckout()` only after Checkout is switched in Task 7. Keep adapter construction and stateless webhook reference parsing unchanged.

- [ ] **Step 6: Do not write a registry unit test.** ADR 0009 forbids non-use-case tests; exercise resolution through the checkout/public-options use cases.

- [ ] **Step 7: Commit the registry seam together with the exact-active gateway lookup if it was not already committed in Task 3.**

```bash
git add apps/api/src/modules/payments/domain/ports/gateway-registry.port.ts \
  apps/api/src/modules/payments/infrastructure/gateway-registry.ts \
  apps/api/src/modules/payments/domain/ports/gateway-config-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-gateway-config.repository.ts \
  apps/api/src/modules/payments/application/use-cases/checkout.use-case.spec.ts
git commit -m "refactor(payments): resolve checkout gateways by route"
```

---

### Task 7: Snapshot route, exact gateway revision and refund policy in Checkout Phase A

**Files:** Payment repository port/implementation; Checkout use case + its one existing spec.

**Payment fields:**

```ts
refundStrategySnapshot: RefundStrategy | null;
manualRefundSlaHoursSnapshot: number | null;
```

`CreatePendingCheckoutData` requires both snapshot values as non-null for every new checkout attempt.

- [ ] **Step 1: Extend `checkout.use-case.spec.ts` before production edits.** Add assertions that a new Payment stores both current refund-policy fields and exact PayOS config revision when routing says `bank_transfer -> payos` while SePay is also connected.

- [ ] **Step 2: Add a route-change/credential-rotation case to the same existing checkout spec.** Phase A prepares a PayOS Payment; simulate route switch to SePay and PayOS credential rotation before Phase B resolution; assert provider I/O still resolves from the original Payment revision. This proves route/credential races cannot redirect the attempt.

- [ ] **Step 3: Add an ambiguous provider-create failure assertion to the same spec.** A retryable PayOS timeout leaves the durable PayOS attempt in `creating`; the next retry reuses that Payment/reference and never creates a SePay attempt even if another route/provider is available.

- [ ] **Step 4: Run the checkout spec and verify RED for the snapshot fields/new route seam.**

- [ ] **Step 5: Extend payment repository mappings and create input.** Map both snapshot fields on every `PaymentRecord`; `createPendingCheckout` writes both values. Preserve nullable reads for legacy rows.

- [ ] **Step 6: Rewrite Checkout Phase A.** Remove `GATEWAY_CONFIG_REPOSITORY` injection and `pickConfigForMethod()`. Inside the existing short transaction:

```ts
const resolved = await registry.resolveActiveForMethod(tx, tenant.id, paymentMethod);
const refundPolicy = await refundPolicies.get(tx, tenant.id);
// existing lock/reuse logic
await payments.createPendingCheckout(tx, tenant.id, {
  ...,
  gateway: resolved.gateway.key,
  gatewayConfigRevisionId: resolved.configRevisionId,
  refundStrategySnapshot: refundPolicy.refundStrategy,
  manualRefundSlaHoursSnapshot: refundPolicy.manualRefundSlaHours,
});
```

The provider call remains in Phase B outside the DB transaction. Phase B still resolves the adapter with `resolveForPayment(tx, prepared.payment)` from the stored revision.

- [ ] **Step 7: Preserve mock semantics.** Even local/mock Payment attempts snapshot the tenant refund policy. Mock routing/fallback must never be used in production.

- [ ] **Step 8: Run the complete checkout spec and verify GREEN.** Then run API typecheck.

```bash
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/checkout.use-case.spec.ts
pnpm --filter=@booking/api typecheck
```

- [ ] **Step 9: Commit.**

```bash
git add apps/api/src/modules/payments/domain/ports/payment-repository.port.ts \
  apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts \
  apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/checkout.use-case.spec.ts
git commit -m "feat(payments): snapshot checkout routing and refund policy"
```

---

### Task 8: Derive public payment options from explicit effective routes only

**Files:** `get-public-payment-options.use-case.ts` + its one spec; route/config ports already added.

- [ ] **Step 1: Rewrite the existing public-options spec first.** Cover in the one permitted use-case spec:
  - four real providers connected + five valid enabled routes returns all five methods;
  - disabling PayOS removes `bank_transfer` when its stored route still points to PayOS;
  - reconnecting PayOS restores the method without rewriting the route;
  - zero enabled configured routes yields no real methods and does not resurrect mock;
  - a truly unconfigured tenant may use the existing non-production mock fallback only with `ALLOW_MOCK_PAYMENTS=true` and non-production environment;
  - an explicit effective real route takes precedence over mock fallback.

- [ ] **Step 2: Run the spec and verify RED against legacy `pickConfigForMethod()` behavior.**

- [ ] **Step 3: Implement effective-route calculation in one tenant transaction.** Load configured routes and active provider configs once. A route is effective only when `enabled`, capability-valid, provider-active, and mock-allowed. Return methods in `customerPaymentMethodSchema.options` order.

- [ ] **Step 4: Distinguish intentional disabled configuration from unconfigured local-dev fallback.** If route rows exist but none are effective/enabled, preserve the tenant's explicit disabled state and do not synthesize mock methods. Mock fallback is only for the existing local/dev unconfigured state.

- [ ] **Step 5: Preserve the existing HTTP error shape when there are no public methods.** `publicPaymentOptionsSchema` may keep `methods.min(1)`; the use case throws `PaymentNotConfigured` rather than returning an invalid empty response. “Zero enabled routes” is a valid tenant configuration even though public checkout has no options.

- [ ] **Step 6: Run the spec and verify GREEN.**

```bash
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/get-public-payment-options.use-case.spec.ts
```

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/payments/application/use-cases/get-public-payment-options.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/get-public-payment-options.use-case.spec.ts
git commit -m "refactor(payments): publish options from explicit routes"
```

---

### Task 9: Resolve refund behavior from Payment snapshot with exact legacy fallback

**Files:** pure refund-policy resolver; ExecuteRefund/ExecuteAutomaticRefund use cases + their existing adjacent specs.

**Pure resolver:**

```ts
export function resolvePaymentRefundPolicy(
  payment: Pick<PaymentRecord, 'refundStrategySnapshot' | 'manualRefundSlaHoursSnapshot'>,
  legacySettings: GatewayPaymentSettings,
): TenantRefundPolicyRecord {
  const strategy = payment.refundStrategySnapshot;
  const hours = payment.manualRefundSlaHoursSnapshot;
  if ((strategy === null) !== (hours === null)) {
    throw new Error('Payment refund policy snapshot is partially populated');
  }
  if (strategy !== null && hours !== null) {
    return { refundStrategy: strategy, manualRefundSlaHours: hours };
  }
  return {
    refundStrategy: legacySettings.refundStrategy,
    manualRefundSlaHours: legacySettings.manualRefundSlaHours,
  };
}
```

- [ ] **Step 1: Add RED cases to `execute-refund.use-case.spec.ts`.** New Payment snapshot wins even if current tenant/gateway settings changed later; legacy `(NULL,NULL)` Payment uses exact historical gateway revision settings through `registry.resolveForPayment`; half-populated snapshot rejects/fails closed.

- [ ] **Step 2: Add RED cases to `execute-automatic-refund.use-case.spec.ts`.** When automatic execution falls back to manual, due-at uses the Payment snapshot SLA, not current provider settings; legacy Payment still uses historical settings.

- [ ] **Step 3: Run both specs and verify RED.**

```bash
pnpm exec vitest run --project api \
  apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts
```

- [ ] **Step 4: Implement the pure resolver and update `ExecuteRefundUseCase`.** Replace direct `configs.findByGateway()` with `registry.resolveForPayment(tx, payment)`, then pass `resolvePaymentRefundPolicy(payment, resolved.settings)` into `Refund.plan`. This guarantees revision-aware legacy behavior and snapshot-first new behavior.

- [ ] **Step 5: Update `ExecuteAutomaticRefundUseCase` to use the same resolver for manual SLA.** Keep provider adapter resolution from `resolveForPayment`; do not change provider refund/query protocol.

- [ ] **Step 6: Run both specs and verify GREEN.** Also run webhook/reconciliation-related use-case tests because `PaymentRecord` gained fields, without changing their behavior.

```bash
pnpm exec vitest run --project api \
  apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/handle-webhook.use-case.spec.ts
```

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/payments/domain/refund-policy-resolution.ts \
  apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/execute-refund.use-case.spec.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.ts \
  apps/api/src/modules/payments/application/use-cases/execute-automatic-refund.use-case.spec.ts
git commit -m "refactor(payments): freeze refund policy per payment"
```

---

### Task 10: Wire dashboard server actions/loaders to the three separate APIs

**Files:** payment contracts already updated; dashboard API paths, loader, actions.

- [ ] **Step 1: Add API paths.** Add `apiPaths.tenant.paymentRouting` → `/tenant/payment-routing` and `apiPaths.tenant.refundPolicy` → `/tenant/refund-policy`.

- [ ] **Step 2: Extend `settings-loader.server.ts` to load three independent data sets:** active gateway configs, payment routing, and refund policy. Parse the latter two with `paymentRoutingResponseSchema` and `tenantRefundPolicySchema`. Preserve separate load errors so one failed card does not hide the others.

- [ ] **Step 3: Add an explicit PayOS credential action branch.** Parse with `payosGatewaySettingsFormSchema`; submit `{ gateway:'payos', environment, credentials:{ clientId, apiKey, checksumKey } }`. Never fall through to the SePay parser.

- [ ] **Step 4: Replace the old combined `payment-settings` action with two intents.**
  - `payment-routing`: build `{ routes }`, validate with `paymentRoutingInputSchema`, PUT to `/tenant/payment-routing`.
  - `refund-policy`: validate strategy/SLA with `updateTenantRefundPolicyInputSchema`, PUT to `/tenant/refund-policy`.

Keep provider credential actions provider-specific and independent.

- [ ] **Step 5: Do not add dashboard tests.** ADR 0009 forbids frontend tests. Verify server code with dashboard lint/typecheck/build and runtime form submissions in Task 12.

- [ ] **Step 6: Run dashboard static checks.**

```bash
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build
```

- [ ] **Step 7: Commit.**

```bash
git add apps/dashboard/app/constants/api-paths.ts \
  apps/dashboard/app/features/tenant/server/settings-loader.server.ts \
  apps/dashboard/app/features/tenant/server/settings-actions.server.ts
git commit -m "refactor(dashboard): split payment settings actions"
```

---

### Task 11: Split dashboard Payment Providers, Checkout Methods and Refund Policy UI

**Files:** provider card, new PayOS card, new checkout-method card, new refund-policy card, tenant settings route; remove old combined card after migration.

- [ ] **Step 1: Build `PayosGatewayBody` following the existing SePay/MoMo/ZaloPay body pattern.** Fields are environment, Client ID, API Key and Checksum Key. Secret values are never echoed from API responses; updating credentials uses a fresh provider-specific submission.

- [ ] **Step 2: Refactor `PaymentGatewayCard` from base/wallet grouping to four independent provider panels.** It receives `configs` and renders SePay, PayOS, MoMo, ZaloPay independently. Remove `BASE_GATEWAYS`, `base`, “cổng cơ bản”, “ví song song” exclusivity language, and Mock from the normal production provider UI. Each configured provider has its own disable action.

- [ ] **Step 3: Create `CheckoutMethodSettingsCard`.** Render all five contract methods:

```text
bank_transfer
napas_qr
international_card
momo_wallet
zalopay_wallet
```

For each method, derive provider choices from `GATEWAY_SUPPORTED_METHODS` intersected with currently connected real providers. If exactly one connected provider supports the method, show it as fixed text instead of a redundant dropdown. If the stored selected provider is now inactive, retain/display that selection with an inactive warning and keep the method ineffective until reconnect/change.

- [ ] **Step 4: Make routing form submission a full replacement.** Every visible configured method emits one `{ method, gateway, enabled }` record; omitted methods intentionally delete stored rows. Allow all switches off. Never infer provider choice from a card group.

- [ ] **Step 5: Create `RefundPolicyCard`.** It owns only `refundStrategy` and `manualRefundSlaHours`, explains `automatic_preferred` may fall back to manual for unsupported transaction/provider cases, and submits the `refund-policy` intent.

- [ ] **Step 6: Update `tenant/settings.tsx`.** Remove `baseGatewayConfig` payment dependency; add `payos`, `payment-routing`, and `refund-policy` feedback-form routing; render the three cards separately under Payments. Pass active configs to provider/routing cards and independent policy data to refund card.

- [ ] **Step 7: Delete `payment-method-settings-card.tsx` after no imports remain.** Do not keep a hidden combined settings UI that can drift back into authority.

- [ ] **Step 8: Run dashboard lint/typecheck/build.**

```bash
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build
```

- [ ] **Step 9: Runtime-smoke the tenant settings UI without adding browser-test infrastructure.** Verify all four provider cards can remain connected; saving PayOS does not visually remove SePay; the method list includes ZaloPay; `bank_transfer` can switch PayOS ↔ SePay without disconnecting either; disabling a selected provider shows an inactive warning; refund policy saves independently.

- [ ] **Step 10: Commit.**

```bash
git add apps/dashboard/app/features/tenant/components/settings/payment-gateway-card.tsx \
  apps/dashboard/app/features/tenant/components/settings/payos-gateway-card.tsx \
  apps/dashboard/app/features/tenant/components/settings/checkout-method-settings-card.tsx \
  apps/dashboard/app/features/tenant/components/settings/refund-policy-card.tsx \
  apps/dashboard/app/routes/tenant/settings.tsx
git rm apps/dashboard/app/features/tenant/components/settings/payment-method-settings-card.tsx
git commit -m "refactor(dashboard): separate payment configuration sections"
```

---

### Task 12: Remove obsolete base/wallet routing authority and run integration gates

**Files:** obsolete routing helper/use case/controller/dashboard path; any compile fallout from legacy symbols.

- [ ] **Step 1: Search production code for obsolete authority before deleting it.**

```bash
rg "pickConfigForMethod|findActiveBase|resolveActiveForCheckout|resolveForTenant|walletGatewayForMethod|isWalletGateway|WALLET_GATEWAYS|UpdateGatewayPaymentSettingsUseCase|gatewayConfigSettings" \
  apps packages --glob '!**/*.spec.ts'
```

Expected before cleanup: only the intentionally retained legacy compatibility/read locations remain; no checkout/public-option/dashboard routing decision depends on base/wallet grouping or gateway settings.

- [ ] **Step 2: Delete `domain/method-routing.ts` and remove `findActiveBase`, `resolveActiveForCheckout`, `resolveForTenant` once there are no callers.** Remove `WALLET_GATEWAYS`, `isWalletGateway()` and `walletGatewayForMethod()` from contracts if `rg` confirms no other production use. Keep `GATEWAY_SUPPORTED_METHODS`.

- [ ] **Step 3: Remove the old gateway-settings write path.** Delete `UpdateGatewayPaymentSettingsUseCase` and its required spec together, remove `PUT /tenant/gateway-config/settings`, module provider registration, dashboard `gatewayConfigSettings` path and old action intent. Do **not** remove `TenantGatewayConfig.settings`, `GatewayConfigRecord.settings`, `GatewayPaymentSettings`, default parsers, or the `resolveForPayment()` legacy settings return in this release.

- [ ] **Step 4: Run the full repository static gate fresh.**

```bash
pnpm test && pnpm turbo lint typecheck build
```

Expected: zero failing use-case specs, zero architecture violations, lint/typecheck/build exit 0. Do not claim this until the command has actually run on the final head.

- [ ] **Step 5: Apply/reset a disposable local DB and run infrastructure smoke.**

```bash
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api seed
```

Then verify with the running API/dashboard:
1. SePay, PayOS, MoMo and ZaloPay are simultaneously active for one tenant.
2. Routes can be exactly `bank_transfer->payos`, `napas_qr->sepay`, `international_card->sepay`, `momo_wallet->momo`, `zalopay_wallet->zalopay`.
3. Public payment options expose all five methods for that configuration.
4. Switching only `bank_transfer->sepay` changes subsequent Payments only; an already-claimed PayOS Payment continues on its recorded PayOS revision.
5. Rotating PayOS credentials after claim does not change that Payment's credentials/provider resolution.
6. Disabling PayOS preserves the stored `bank_transfer->payos` route but removes the method from public checkout; reconnecting PayOS restores it without rewriting the route.
7. An explicit zero-enabled route configuration does not enable local mock fallback.
8. A retryable/ambiguous PayOS create failure never creates a SePay payment automatically.
9. New Payments store both refund snapshot fields; changing tenant refund policy later does not alter refund planning for the old Payment.
10. A legacy Payment with `(NULL,NULL)` snapshots reads historical settings from its exact revision; a deliberately half-populated fixture fails closed.
11. Cross-tenant route/refund-policy access is denied by FORCE RLS.

- [ ] **Step 6: Run the repository's existing local smoke commands if present on the final branch.**

```bash
pnpm smoke:local
pnpm smoke:infra:local
```

If either script is absent from the current `package.json`, record it as not available instead of inventing a replacement script; the manual runtime cases above remain mandatory.

- [ ] **Step 7: Run focused real-provider sandbox checkout only for locally available credentials.** Never print secrets in logs/PR notes. Verify each available provider independently; lack of a provider credential is recorded as an unexecuted external sandbox case, not silently treated as pass.

- [ ] **Step 8: Re-run the full static gate after any smoke-discovered fix.**

```bash
pnpm test && pnpm turbo lint typecheck build
```

- [ ] **Step 9: Inspect final diff and acceptance criteria before PR.**

```bash
git diff --stat main...HEAD
git diff --check main...HEAD
rg "pickConfigForMethod|findActiveBase|resolveActiveForCheckout|walletGatewayForMethod" apps packages
```

Expected: no whitespace errors; no production implicit routing symbols; no destructive removal of legacy gateway settings/history.

- [ ] **Step 10: Commit cleanup only after fresh verification.**

```bash
git add -A
git commit -m "refactor(payments): retire implicit provider routing"
```

Do not merge or deploy from this plan. Open/review an implementation PR only after the final verification evidence is captured, and wait for separate authorization for merge/deploy.

---

## Self-Review Against the Approved Spec

- Provider independence: Tasks 3, 11 and 12 remove cross-provider activation exclusivity and base/wallet UI semantics.
- Explicit deterministic routing: Tasks 1, 2, 4, 6, 7 and 8 cover schema, validation, API, checkout resolution and public options.
- No automatic failover: Global constraint + Checkout Task 7 + runtime gate Task 12 explicitly prove the same durable Payment/provider is retried.
- Refund-policy separation and historical behavior: Tasks 2, 5, 7 and 9 implement tenant policy, new-Payment snapshot, exact-revision legacy fallback and half-snapshot fail-closed behavior.
- Route/credential races: Tasks 3, 4, 6 and 7 use the shared lock for configuration writes and the recorded Payment revision after Phase A.
- RLS/FORCE RLS: Task 2 creates both policies and Task 12 re-verifies cross-tenant isolation.
- Migration/backfill/rollback: Task 2 is additive, mirrors legacy route selection, deterministically initializes current policy, leaves historical Payment snapshots null, and retains legacy settings.
- Dashboard split: Tasks 10–11 provide independent Provider, Checkout Methods and Refund Policy sections and add the missing ZaloPay method plus PayOS credential form.
- Repository test-policy compliance: all new executable tests are use-case specs; repository/contracts/controller/dashboard behavior uses architecture/static gates and runtime smoke as required by ADR 0009.
- Production release remains out of scope until separately authorized.

## Execution Handoff

Implementation should branch from the approved design branch after this plan commit, preferably as `refactor/payment-provider-routing-separation`, and use `superpowers:using-git-worktrees` before production edits. Execute Tasks 1–12 with TDD where use-case behavior changes: write the allowed use-case assertion first, observe RED, make the minimal production change, observe GREEN, then commit. Database/repository/frontend changes that cannot have dedicated tests under ADR 0009 are verified by architecture guards, static builds and explicit runtime smoke at each relevant checkpoint.