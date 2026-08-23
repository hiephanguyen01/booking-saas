# Payment Provider / Routing / Refund Policy Separation Design

**Date:** 2026-08-23  
**Status:** Approved design, implementation not started  
**Base:** `main` at `75ff9de3c799bf7f41f678218620fb5c5c53a3b8`

## 1. Problem

BookingOS currently couples three different concerns inside `TenantGatewayConfig` and `GatewayPaymentSettings`:

1. provider connection and encrypted credentials;
2. which provider is considered active for checkout;
3. which storefront payment methods and refund policy are enabled.

The repository enforces a special `base gateway` model: SePay, PayOS and mock are mutually exclusive, while MoMo and ZaloPay may be active in parallel. `pickConfigForMethod()` then infers routing from this grouping instead of reading an explicit tenant choice.

That model prevents a tenant from keeping both SePay and PayOS connected at the same time even though the two providers may serve different checkout methods. It also makes credential rotation create new revisions that carry unrelated storefront/refund settings.

The redesign separates the concerns:

> **Provider Connection != Payment Method Routing != Refund Policy**

A tenant may connect every supported provider independently. Each customer-facing payment method routes to exactly one active provider. Refund behavior is a tenant policy, snapshotted onto the Payment so later policy edits do not retroactively alter historical transactions.

## 2. Goals

- Allow SePay, PayOS, MoMo and ZaloPay to be connected and active simultaneously.
- Preserve immutable gateway credential revisions and historical `gatewayConfigRevisionId` resolution.
- Make checkout routing explicit and deterministic per payment method.
- Keep one provider per method at a time; do not implement automatic provider failover.
- Separate refund policy from credential revision lifecycle.
- Preserve historical refund behavior by snapshotting the effective refund policy on each new Payment.
- Keep existing payments, refunds and provider references valid through migration.
- Preserve RLS / FORCE RLS for every new tenant-scoped table.
- Keep credentials encrypted at rest with the existing AES-256-GCM mechanism.
- Keep provider capability validation centralized in `@booking/contracts`.

## 3. Non-goals

- No automatic provider fallback or retry from one provider to another.
- No weighted routing, traffic splitting or provider priority lists.
- No multi-provider attempt for the same Payment.
- No production credential migration outside the existing encrypted credential rows.
- No change to provider webhook signature algorithms or refund provider protocols.
- No change to historical Payment -> gateway revision lookup semantics.
- No new payment provider in this change.

## 4. Current behavior to remove

The current design uses these concepts:

- `WALLET_GATEWAYS = ['momo', 'zalopay']`;
- non-wallet providers form an implicit `base gateway` group;
- saving a base gateway deactivates every other active base gateway;
- wallet methods are hard-routed 1:1 to their wallet gateway;
- base methods are resolved by whichever active base config advertises the method;
- `GatewayPaymentSettings` stores `enabledMethods`, `refundStrategy` and `manualRefundSlaHours` with the credential revision.

After migration, gateway type remains a provider capability identifier only. It no longer determines activation exclusivity.

## 5. Target domain model

### 5.1 Provider connection

`TenantGatewayConfig` remains an immutable provider credential revision.

Responsibilities:

- tenant ownership;
- gateway key;
- sandbox / production environment;
- encrypted provider credentials;
- active revision marker;
- revision timestamps.

New invariant:

> At most one active revision per `(tenant_id, gateway)`.

There is no cross-gateway exclusivity. Active SePay, PayOS, MoMo and ZaloPay rows may coexist.

`settings` is no longer authoritative for checkout routing or refund policy. During the compatibility phase the JSON column may remain populated/readable for old rows, but new behavior must not depend on it. Removal of the column can be a later cleanup migration after all application references are gone.

### 5.2 Payment method routing

Introduce a tenant-scoped table conceptually named `TenantPaymentMethodRoute`:

```prisma
model TenantPaymentMethodRoute {
  id        String         @id @default(uuid(7)) @db.Uuid
  tenantId  String         @map("tenant_id") @db.Uuid
  method    String
  gateway   PaymentGateway
  enabled   Boolean        @default(true)
  createdAt DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, method])
  @@index([tenantId, gateway])
  @@map("tenant_payment_method_routes")
}
```

`method` is validated against `customerPaymentMethodSchema`. The implementation may introduce a database enum if the project prefers DB-level method validation, but the application contract remains the source of truth.

The unique `(tenant_id, method)` constraint makes routing deterministic: a payment method has zero or one configured provider.

An enabled route is effective only when:

1. the route's gateway supports the method according to `GATEWAY_SUPPORTED_METHODS`;
2. that tenant currently has an active credential revision for the gateway.

A disabled provider does not delete routes. Routes remain configured but ineffective, so reconnecting the provider can restore the previous routing choice without reconfiguration.

### 5.3 Refund policy

Introduce a tenant-scoped current policy conceptually named `TenantRefundPolicy`:

```prisma
model TenantRefundPolicy {
  tenantId             String   @id @map("tenant_id") @db.Uuid
  refundStrategy       String   @map("refund_strategy")
  manualRefundSlaHours Int      @map("manual_refund_sla_hours")
  updatedBy            String?  @map("updated_by") @db.Uuid
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_refund_policies")
}
```

Contract validation remains:

- `refundStrategy`: `manual | automatic_preferred`;
- `manualRefundSlaHours`: integer `1..720`.

The current policy is not used directly for historical refunds. It is the source for new Payment snapshots.

### 5.4 Payment refund-policy snapshot

Add nullable columns to `payments`:

- `refund_strategy_snapshot`;
- `manual_refund_sla_hours_snapshot`.

For every new Payment created after the migration, checkout Phase A snapshots the tenant's current refund policy into these fields in the same transaction that persists gateway/gateway revision ownership.

Refund planning reads:

1. the Payment snapshot when present;
2. for legacy Payments with null snapshots, the historical `TenantGatewayConfig.settings` referenced by `gatewayConfigRevisionId`;
3. only for pre-foundation legacy Payments without a revision, the existing legacy gateway-resolution fallback.

This preserves behavior of existing payments and makes future refund policy edits apply only to future payments.

## 6. Routing semantics

### 6.1 Capability map

`GATEWAY_SUPPORTED_METHODS` remains authoritative:

- SePay -> `bank_transfer`, `napas_qr`, `international_card`;
- PayOS -> `bank_transfer`;
- MoMo -> `momo_wallet`;
- ZaloPay -> `zalopay_wallet`;
- mock -> local/test methods only as currently defined.

The special `WALLET_GATEWAYS`, `isWalletGateway()` and `walletGatewayForMethod()` concepts must no longer participate in production routing.

### 6.2 No implicit provider selection

Checkout must never choose the first matching active provider.

For `bank_transfer`, if both SePay and PayOS are connected, the tenant must explicitly select one route. If no enabled route exists, `bank_transfer` is not shown and checkout rejects it as not configured.

### 6.3 No provider fallback

If a route is `bank_transfer -> payos` and PayOS fails or times out, BookingOS does not automatically create a second SePay payment.

Reason: provider create may have succeeded even when BookingOS did not receive the response. Cross-provider retry would create duplicate payable resources and violate the durable checkout/idempotency guarantees added in PR #190.

Provider-specific recovery remains inside the selected adapter using the already-persisted Payment and stable provider identity.

### 6.4 Route-change race

Checkout Phase A resolves the route and active gateway revision inside the transactional claim. The Payment then stores:

- selected gateway;
- exact `gatewayConfigRevisionId`;
- payment method;
- refund policy snapshot.

After Phase A, provider I/O resolves from the Payment revision, not from the current route. Therefore changing a route or rotating credentials while checkout is in flight cannot redirect the already-claimed Payment to another provider.

## 7. Repository and application boundaries

### 7.1 Gateway config repository

Change `PrismaGatewayConfigRepository.upsert()`:

Current behavior:

- wallet gateway: deactivate same gateway;
- base gateway: deactivate all active non-wallet gateways.

New behavior:

- always deactivate only active revisions for the same `(tenant, gateway)`;
- create a new active revision;
- never deactivate another gateway as a side effect.

`findActiveBase()` becomes obsolete and should be removed after callers migrate.

`findActiveAll()` and `findById()` remain useful.

### 7.2 Payment method route repository

Add a new port/repository responsible only for routes, for example:

```ts
interface IPaymentMethodRouteRepository {
  list(tx, tenantId): Promise<PaymentMethodRoute[]>;
  findEnabledByMethod(tx, tenantId, method): Promise<PaymentMethodRoute | null>;
  replaceAll(tx, tenantId, routes): Promise<PaymentMethodRoute[]>;
}
```

`replaceAll` is preferred over independent toggle writes so a dashboard save is atomic and validation can reject the whole configuration before changing any route.

The repository uses a per-tenant advisory lock for routing writes. An implementation may share a broader payment-configuration lock with gateway config writes if that makes validation of `route -> active gateway` atomic; avoid unrelated lock ordering.

### 7.3 Refund policy repository

Add a small port/repository for the current tenant policy:

```ts
interface IRefundPolicyRepository {
  get(tx, tenantId): Promise<TenantRefundPolicy>;
  upsert(tx, tenantId, policy, actorId): Promise<TenantRefundPolicy>;
}
```

Absence uses the current default behavior (`manual`, 72 hours) without requiring every tenant to be backfilled before the app can start.

### 7.4 Gateway registry

Replace checkout resolution based on active base/wallet inference with explicit method resolution, for example:

```ts
resolveActiveForMethod(tx, tenantId, method): Promise<ResolvedGateway>
```

Algorithm:

1. find enabled route for method;
2. reject if absent;
3. validate `GATEWAY_SUPPORTED_METHODS[route.gateway]` contains method;
4. load the tenant's active config for `route.gateway`;
5. reject if no active provider connection exists;
6. construct adapter and return exact config revision id.

`resolveForPayment()` remains unchanged in principle and remains the only lifecycle resolution path for already-created Payments.

## 8. Contracts and HTTP API

### 8.1 Gateway connection API

Keep:

- `GET /tenant/gateway-config`;
- `PUT /tenant/gateway-config`;
- `DELETE /tenant/gateway-config?gateway=<key>`.

Behavior change: `PUT` activates/revises only the submitted provider. It does not disable any other provider.

The response remains credential-free.

### 8.2 Payment routing API

Add:

- `GET /tenant/payment-routing`;
- `PUT /tenant/payment-routing`.

Suggested request:

```json
{
  "routes": [
    { "method": "bank_transfer", "gateway": "payos", "enabled": true },
    { "method": "napas_qr", "gateway": "sepay", "enabled": true },
    { "method": "international_card", "gateway": "sepay", "enabled": true },
    { "method": "momo_wallet", "gateway": "momo", "enabled": true },
    { "method": "zalopay_wallet", "gateway": "zalopay", "enabled": true }
  ]
}
```

Validation before write:

- method values are unique;
- each route gateway supports that method;
- every enabled route references an active tenant provider connection;
- unknown providers/methods are rejected;
- an empty route list is allowed only if product behavior explicitly permits disabling all online payment methods; otherwise require at least one enabled route. For this design, **at least one enabled route is required** to preserve the existing tenant payment-configuration expectation.

### 8.3 Refund policy API

Add:

- `GET /tenant/refund-policy`;
- `PUT /tenant/refund-policy`.

Suggested body:

```json
{
  "refundStrategy": "automatic_preferred",
  "manualRefundSlaHours": 72
}
```

### 8.4 Public payment options

`GET /public/payment-options` stops deriving methods from gateway config settings.

It returns methods that have an enabled route and an active provider connection. It preserves the existing provider-neutral response shape:

```json
{
  "methods": ["bank_transfer", "momo_wallet"]
}
```

`ALLOW_MOCK_PAYMENTS=true` remains a non-production fallback only when a tenant has no configured effective routes/providers, preserving current local development behavior. Explicit configured routes take precedence over mock fallback.

## 9. Dashboard UX

Split the current payment settings presentation into three clear sections.

### 9.1 Payment Providers

Render one independent card for each supported real provider:

- SePay;
- PayOS;
- MoMo;
- ZaloPay.

Each card owns only:

- connection status;
- environment;
- provider-specific credentials;
- connect/update credentials action;
- disable provider action.

Saving PayOS must not visually or technically disable SePay.

Mock is a development facility and should not be shown as a normal production provider card.

### 9.2 Checkout Methods

Render the customer-facing methods independently from provider credentials.

Example:

```text
[on] Bank transfer        Provider: PayOS
[on] NAPAS QR             Provider: SePay
[on] International card   Provider: SePay
[on] MoMo wallet           Provider: MoMo
[on] ZaloPay wallet        Provider: ZaloPay
```

Provider selector options are capability-filtered and connected-provider-filtered. If only one connected provider supports the method, display it without an unnecessary dropdown.

If a selected provider is later disabled, keep the stored route but surface an invalid/inactive state and remove the method from public checkout until the provider is reconnected or the route is changed.

### 9.3 Refund Policy

Render refund policy as its own tenant-level card:

- manual;
- automatic preferred;
- manual SLA hours.

The UI should explain that `automatic_preferred` still falls back to manual handling where the selected payment provider or transaction type cannot execute an automatic refund.

## 10. Migration strategy

Use one explicit Prisma/SQL migration with no destructive rewrite of payment history.

### 10.1 Schema

1. create `tenant_payment_method_routes`;
2. create `tenant_refund_policies`;
3. add nullable Payment refund snapshot columns;
4. add indexes/constraints;
5. enable and FORCE RLS on both new tenant tables;
6. add tenant-isolation policies following existing repository conventions.

### 10.2 Backfill current routing without behavior change

For every tenant:

1. read all active gateway configs;
2. for wallet methods, preserve current behavior by preferring the exact wallet gateway (`momo_wallet -> momo`, `zalopay_wallet -> zalopay`) when that active gateway currently enables the method;
3. for non-wallet methods, preserve current behavior by using the currently active non-wallet/base config when its legacy `settings.enabledMethods` contains the method and capability map permits it;
4. create at most one route per method;
5. do not create a route for a legacy setting that claims a method the provider capability map does not support.

This intentionally mirrors current `pickConfigForMethod()` behavior during migration so the storefront method list does not change merely because the schema changed.

### 10.3 Backfill refund policy

For each tenant with at least one active config, choose the legacy policy currently presented by the payment settings UI for the active checkout configuration. If there is no usable config, insert/default to:

```text
refundStrategy = manual
manualRefundSlaHours = 72
```

Do not backfill Payment snapshot columns. Existing Payments retain null snapshots and use the legacy historical gateway-revision settings fallback. New Payments always write non-null snapshots.

### 10.4 Compatibility window

During the first release after migration:

- old `TenantGatewayConfig.settings` remains readable for legacy Payment refund fallback;
- new checkout/public-option logic ignores legacy `enabledMethods`;
- new dashboard writes routes/refund policy through the new APIs;
- credential rotation no longer copies checkout/refund settings into the new revision as an authoritative behavior source.

A later cleanup can remove the legacy settings column only after no Payment can require that fallback, or after a separate historical backfill makes the fallback unnecessary.

## 11. Error handling

Use domain-specific errors rather than silent fallback:

- route missing -> payment method not configured;
- route gateway unsupported for method -> invalid tenant payment routing configuration;
- enabled route references inactive provider -> payment method temporarily unavailable/configuration invalid;
- duplicate method in PUT payload -> validation error;
- provider credential config invalid -> existing invalid gateway config behavior;
- provider request failures -> existing gateway-specific retry/final/configuration classification.

Public endpoints must not expose credential details or internal provider error bodies.

## 12. Concurrency and correctness invariants

The implementation must prove these invariants:

1. A tenant can have active SePay and PayOS revisions simultaneously.
2. A tenant cannot have two active revisions of the same gateway.
3. A method has at most one configured route per tenant.
4. An enabled route must reference a gateway capable of the method.
5. Checkout persists gateway + exact gateway config revision before provider I/O.
6. Route changes after Payment claim do not change that Payment's provider.
7. Credential rotation after Payment claim does not change that Payment's provider credentials.
8. Refund policy changes after Payment creation do not change that Payment's refund policy.
9. No cross-provider retry occurs after an ambiguous provider response.
10. Webhook/refund lifecycle continues resolving by Payment's historical gateway revision.
11. RLS and FORCE RLS apply to both new tenant-scoped tables.

## 13. Testing strategy

### 13.1 Contracts

Add tests for:

- routing request schema;
- duplicate/unsupported method-provider pairs;
- refund policy schema;
- capability map behavior.

### 13.2 Repository

TDD coverage for:

- SePay and PayOS both remain active after independent upserts;
- rotating PayOS deactivates only the previous PayOS revision;
- route uniqueness and atomic replacement;
- inactive provider route validation;
- tenant isolation and RLS architecture checks;
- refund policy read/write defaults.

### 13.3 Application

Checkout tests must cover:

- `bank_transfer -> payos` while SePay is also connected;
- switch route to SePay affects only subsequent Payments;
- in-flight Payment stays on PayOS after route switch;
- provider credential rotation does not alter historical Payment resolution;
- payment stores refund policy snapshot;
- later policy edit does not alter old Payment refund planning;
- legacy Payment without snapshot uses historical gateway settings fallback.

Public option tests must cover:

- all four providers active with five explicit methods;
- provider disabled makes its routed methods disappear;
- reconnect restores stored enabled routes;
- no configured effective route gives existing mock fallback only in allowed local mode.

### 13.4 Dashboard

Test:

- each provider form mutates only that provider;
- PayOS save does not deactivate/remove SePay UI state;
- checkout method selectors only show connected capable providers;
- routing save is atomic;
- refund policy form is independent from provider credential forms;
- ZaloPay method is included in the method list (the current card omits it from its local `METHODS` display list).

### 13.5 Regression gates

Before integration:

- `pnpm test`;
- `pnpm turbo lint typecheck build`;
- architecture/RLS checks;
- `pnpm smoke:local`;
- `pnpm smoke:infra:local`;
- focused live sandbox checkout tests for every configured real provider for which credentials are available locally.

No production deployment is part of this implementation plan unless separately authorized.

## 14. Local test target after implementation

The desired local configuration becomes possible without gateway switching:

```text
Providers connected:
  SePay    active
  PayOS    active
  MoMo     active
  ZaloPay  active

Routes:
  bank_transfer       -> payos
  napas_qr            -> sepay
  international_card  -> sepay
  momo_wallet         -> momo
  zalopay_wallet      -> zalopay

Refund policy:
  automatic_preferred
  manual SLA 72h
```

Expected public response:

```json
{
  "methods": [
    "bank_transfer",
    "napas_qr",
    "international_card",
    "momo_wallet",
    "zalopay_wallet"
  ]
}
```

The tenant may later change only `bank_transfer -> sepay` without disconnecting PayOS and without affecting any Payment already created.

## 15. Rollout / rollback

### Rollout

1. deploy schema + compatibility reads;
2. backfill routes and tenant refund policies in migration;
3. deploy API routing/refund snapshot behavior;
4. deploy Dashboard split UI;
5. verify local/staging-equivalent smoke and real sandbox flows;
6. only then consider production release with explicit authorization.

### Rollback

Application rollback remains possible while legacy `TenantGatewayConfig.settings` is retained. New route/refund tables are additive. New Payment snapshot fields are additive and nullable.

Do not drop legacy settings or remove fallback code in the same release. That keeps rollback low-risk.

## 16. Acceptance criteria

The change is complete only when all are true:

- SePay and PayOS can both be active for one tenant.
- All real providers can remain connected simultaneously.
- Every enabled checkout method has exactly one explicit provider route.
- No checkout method is inferred from `base` versus `wallet` grouping.
- No provider save disables a different provider.
- Public payment options are derived from explicit effective routes.
- Checkout snapshots exact gateway revision and refund policy before provider I/O.
- Historical payments/refunds preserve their provider and policy behavior.
- Dashboard has separate Provider, Checkout Methods and Refund Policy sections.
- Existing payment/refund/webhook tests remain green.
- New route/refund tables pass RLS/FORCE-RLS architecture gates.
- Local test can expose all five customer methods while SePay, PayOS, MoMo and ZaloPay are all connected.
