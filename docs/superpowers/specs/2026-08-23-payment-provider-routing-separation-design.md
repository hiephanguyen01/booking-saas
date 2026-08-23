# Payment Provider / Routing / Refund Policy Separation Design

**Date:** 2026-08-23  
**Status:** Design direction approved; written spec pending user review  
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

A tenant can connect every supported provider independently. Each customer-facing payment method routes to exactly one provider when enabled. Refund behavior is a tenant policy, snapshotted onto the Payment so later policy edits do not retroactively alter historical transactions.

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

After migration, gateway type is a provider capability identifier only. It no longer determines activation exclusivity.

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

There is no cross-gateway exclusivity. Active SePay, PayOS, MoMo and ZaloPay rows can coexist.

`settings` is no longer authoritative for checkout routing or refund policy. During the compatibility release the JSON column remains readable for old rows because legacy Payments can still need its historical refund policy. New checkout/routing/refund-policy writes do not use it as the source of truth. Dropping the column is explicitly deferred to a later migration.

### 5.2 Payment method routing

Add the Prisma model `TenantPaymentMethodRoute`:

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

`method` stays a string at the Prisma layer so it reuses `customerPaymentMethodSchema` without introducing a second generated TypeScript enum. The hand-written SQL migration adds a CHECK constraint limiting values to:

- `bank_transfer`;
- `napas_qr`;
- `international_card`;
- `momo_wallet`;
- `zalopay_wallet`.

The migration also adds a gateway CHECK for the currently implemented keys used by the application contract: `sepay`, `payos`, `momo`, `zalopay`, `mock`. The existing `PaymentGateway` DB enum contains `vnpay`, but routing to it stays invalid until the contracts and adapter actually support it.

The unique `(tenant_id, method)` constraint makes routing deterministic: a payment method has zero or one configured provider.

An enabled route is effective only when:

1. the route's gateway supports the method according to `GATEWAY_SUPPORTED_METHODS`;
2. that tenant currently has an active credential revision for the gateway;
3. mock routing is allowed by the current non-production mock-payment guard.

A disabled provider does not delete routes. Routes remain configured but ineffective, so reconnecting the provider can restore the previous routing choice without reconfiguration.

### 5.3 Refund policy

Add the Prisma model `TenantRefundPolicy`:

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

The SQL migration adds CHECK constraints for:

- `refund_strategy IN ('manual', 'automatic_preferred')`;
- `manual_refund_sla_hours BETWEEN 1 AND 720`.

The current policy is the source for new Payment snapshots; it is not read dynamically when planning a refund for an existing Payment.

### 5.4 Payment refund-policy snapshot

Add nullable columns to `payments`:

- `refund_strategy_snapshot`;
- `manual_refund_sla_hours_snapshot`.

For every new Payment created after the migration, checkout Phase A snapshots the tenant's current refund policy into these fields in the same transaction that persists gateway/gateway revision ownership.

Refund planning reads in this order:

1. Payment snapshot when both snapshot fields are present;
2. for legacy Payments with null snapshots and a `gatewayConfigRevisionId`, the historical `TenantGatewayConfig.settings` for that exact revision;
3. for pre-foundation legacy Payments without a revision, the existing legacy gateway-resolution fallback and its settings.

A half-populated snapshot is invalid data and must fail closed rather than mixing current and historical policies.

This preserves behavior of existing payments and makes future refund policy edits apply only to future payments.

## 6. Routing semantics

### 6.1 Capability map

`GATEWAY_SUPPORTED_METHODS` remains authoritative:

- SePay -> `bank_transfer`, `napas_qr`, `international_card`;
- PayOS -> `bank_transfer`;
- MoMo -> `momo_wallet`;
- ZaloPay -> `zalopay_wallet`;
- mock -> local/test methods only as currently defined.

`WALLET_GATEWAYS`, `isWalletGateway()` and `walletGatewayForMethod()` are removed from checkout/public-option routing after callers migrate. They must not determine production provider selection.

### 6.2 No implicit provider selection

Checkout never chooses the first matching active provider.

For `bank_transfer`, if both SePay and PayOS are connected, the tenant explicitly selects one route. If no enabled effective route exists, `bank_transfer` is not shown and checkout rejects it as not configured.

### 6.3 No provider fallback

If a route is `bank_transfer -> payos` and PayOS fails or times out, BookingOS does not automatically create a second SePay payment.

Reason: provider create can have succeeded even when BookingOS did not receive the response. Cross-provider retry would create duplicate payable resources and violate the durable checkout/idempotency guarantees added in PR #190.

Provider-specific recovery remains inside the selected adapter using the already-persisted Payment and stable provider identity.

### 6.4 Route-change race

Checkout Phase A resolves the route and active gateway revision inside the transactional claim. The Payment then stores:

- selected gateway;
- exact `gatewayConfigRevisionId`;
- payment method;
- refund policy snapshot.

After Phase A, provider I/O resolves from the Payment revision, not from the current route. Therefore changing a route or rotating credentials while checkout is in flight cannot redirect the already-claimed Payment to another provider.

## 7. Repository and application boundaries

### 7.1 One payment-configuration lock

All tenant payment-configuration writes use the existing advisory-lock namespace `gateway-config:<tenantId>`:

- provider credential revision upsert/deactivate;
- payment-route replacement;
- refund-policy update.

Keeping one existing lock namespace avoids a rolling-deploy window where old and new code would take different locks. Route validation (`route -> active provider`) happens while this lock is held, so a provider cannot be disabled concurrently between validation and route persistence.

### 7.2 Gateway config repository

Change `PrismaGatewayConfigRepository.upsert()`:

Current behavior:

- wallet gateway: deactivate same gateway;
- base gateway: deactivate all active non-wallet gateways.

New behavior:

- acquire `gateway-config:<tenantId>` lock;
- deactivate only active revisions for the same `(tenant, gateway)`;
- create a new active revision;
- never deactivate another gateway as a side effect.

`findActiveBase()` becomes obsolete and is removed after callers migrate.

Add/standardize a lookup for the active revision of an exact gateway, for example `findActiveByGateway(tx, tenantId, gateway)`.

`findActiveAll()` and `findById()` remain useful.

### 7.3 Payment method route repository

Add a new port/repository responsible only for routes:

```ts
interface IPaymentMethodRouteRepository {
  list(tx, tenantId): Promise<PaymentMethodRoute[]>;
  findEnabledByMethod(tx, tenantId, method): Promise<PaymentMethodRoute | null>;
  replaceAll(tx, tenantId, routes): Promise<PaymentMethodRoute[]>;
}
```

`replaceAll` is the only dashboard write path. It validates the complete submitted state and applies it atomically under `gateway-config:<tenantId>`.

Request semantics are full replacement of the configured route rows:

- a submitted enabled row creates/updates that method route;
- a submitted disabled row preserves its gateway selection but makes it ineffective;
- an omitted method removes any stored route for that method;
- zero enabled routes is valid and intentionally disables online checkout for the tenant.

### 7.4 Refund policy repository

Add a port/repository for the current tenant policy:

```ts
interface IRefundPolicyRepository {
  get(tx, tenantId): Promise<TenantRefundPolicy>;
  upsert(tx, tenantId, policy, actorId): Promise<TenantRefundPolicy>;
}
```

Absence returns the current default behavior (`manual`, 72 hours). Writes acquire `gateway-config:<tenantId>`.

### 7.5 Gateway registry

Replace checkout resolution based on active base/wallet inference with explicit method resolution:

```ts
resolveActiveForMethod(tx, tenantId, method): Promise<ResolvedGateway>
```

Algorithm:

1. find enabled route for method;
2. reject if absent;
3. validate `GATEWAY_SUPPORTED_METHODS[route.gateway]` contains method;
4. validate mock use if the route gateway is `mock`;
5. load the tenant's active config for `route.gateway`;
6. reject if no active provider connection exists;
7. construct adapter and return the exact config revision id.

`resolveForPayment()` remains unchanged in principle and remains the lifecycle resolution path for already-created Payments.

## 8. Contracts and HTTP API

### 8.1 Gateway connection API

Keep:

- `GET /tenant/gateway-config`;
- `PUT /tenant/gateway-config`;
- `DELETE /tenant/gateway-config?gateway=<key>`.

Behavior change: `PUT` activates/revises only the submitted provider. It does not disable any other provider.

`DELETE` with a gateway disables only that provider. Existing no-gateway disable-all behavior can remain for emergency/maintenance use, but it does not delete routes.

The response remains credential-free.

### 8.2 Payment routing API

Add:

- `GET /tenant/payment-routing`;
- `PUT /tenant/payment-routing`.

Request:

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
- disabled routes can reference a currently inactive provider so the selection can be restored later;
- mock routes are rejected when mock payments are not permitted;
- unknown providers/methods are rejected;
- an empty list and a list with zero enabled routes are valid.

### 8.3 Refund policy API

Add:

- `GET /tenant/refund-policy`;
- `PUT /tenant/refund-policy`.

Body:

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

`ALLOW_MOCK_PAYMENTS=true` remains a non-production fallback only when the tenant has no effective real route/provider configuration. Explicit configured effective routes take precedence over mock fallback.

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

Mock is a development facility and is not shown as a normal production provider card.

### 9.2 Checkout Methods

Render customer-facing methods independently from provider credentials.

Example:

```text
[on] Bank transfer        Provider: PayOS
[on] NAPAS QR             Provider: SePay
[on] International card   Provider: SePay
[on] MoMo wallet           Provider: MoMo
[on] ZaloPay wallet        Provider: ZaloPay
```

Provider selector options are capability-filtered and connected-provider-filtered. If only one connected provider supports a method, display it without an unnecessary dropdown.

If a selected provider is later disabled, keep the stored route, display an inactive-provider warning in Dashboard, and remove the method from public checkout until the provider is reconnected or the route is changed.

The method list includes all five contract methods; the current card's omission of `zalopay_wallet` is corrected as part of this refactor.

### 9.3 Refund Policy

Render refund policy as its own tenant-level card:

- manual;
- automatic preferred;
- manual SLA hours.

The UI explains that `automatic_preferred` still falls back to manual handling where the Payment's selected provider or transaction type cannot execute an automatic refund.

## 10. Migration strategy

Use one explicit Prisma/SQL migration with no destructive rewrite of payment history.

### 10.1 Schema

1. create `tenant_payment_method_routes`;
2. create `tenant_refund_policies`;
3. add nullable Payment refund snapshot columns;
4. add unique/index/CHECK constraints;
5. enable and FORCE RLS on both new tenant tables;
6. add tenant-isolation policies following existing repository conventions.

### 10.2 Backfill current routing without behavior change

For every tenant:

1. read all active gateway configs;
2. for `momo_wallet`, create `momo_wallet -> momo` only when active MoMo currently enables that method;
3. for `zalopay_wallet`, create `zalopay_wallet -> zalopay` only when active ZaloPay currently enables that method;
4. for each non-wallet method, use the single active non-wallet/base config when its legacy `settings.enabledMethods` contains the method and `GATEWAY_SUPPORTED_METHODS` permits it;
5. create at most one route per method;
6. ignore legacy settings that claim a method the provider capability map does not support.

This exactly mirrors current `pickConfigForMethod()` selection semantics during migration, including wallet preference over a mock/base config that may advertise wallet methods.

### 10.3 Backfill current tenant refund policy

Historical Payments are unaffected because they retain null snapshot columns and continue to read the settings of their exact historical gateway revision.

The new current tenant policy is only the starting policy for Payments created after the release. Backfill it deterministically:

1. if an active non-wallet/base config exists, copy its legacy `refundStrategy` and `manualRefundSlaHours`;
2. otherwise if active MoMo exists, copy MoMo's legacy policy;
3. otherwise if active ZaloPay exists, copy ZaloPay's legacy policy;
4. otherwise use `manual` / `72`.

This precedence is deterministic and reflects the old UI's base-checkout policy when a base provider exists. Any historical provider-specific difference remains preserved for old Payments through their gateway revision fallback.

### 10.4 Payment snapshot backfill

Do **not** backfill the new Payment snapshot columns.

Existing Payments keep null snapshots and resolve historical policy from the gateway config revision. New Payments always write both snapshot fields. This avoids rewriting payment history and avoids guessing which tenant policy should have applied at an earlier date.

### 10.5 Compatibility window

During the first release after migration:

- old `TenantGatewayConfig.settings` remains readable for legacy Payment refund fallback;
- new checkout/public-option logic ignores legacy `enabledMethods`;
- new Dashboard writes routes/refund policy through the new APIs;
- credential rotation no longer copies checkout/refund settings as an authoritative behavior source;
- old application versions remain rollback-compatible with the additive schema.

A later cleanup can remove legacy settings only after historical refund fallback is eliminated by a separately reviewed migration.

## 11. Error handling

Use domain-specific errors rather than silent fallback:

- route missing -> payment method not configured;
- route gateway unsupported for method -> invalid tenant payment routing configuration;
- enabled route references inactive provider -> payment method unavailable/configuration invalid;
- half-populated Payment refund snapshot -> invariant violation/fail closed;
- duplicate method in PUT payload -> validation error;
- provider credential config invalid -> existing invalid gateway config behavior;
- provider request failures -> existing gateway-specific retry/final/configuration classification.

Public endpoints do not expose credential details or internal provider error bodies.

## 12. Concurrency and correctness invariants

The implementation must prove these invariants:

1. A tenant can have active SePay and PayOS revisions simultaneously.
2. A tenant cannot have two active revisions of the same gateway.
3. A method has at most one configured route per tenant.
4. An enabled route references a gateway capable of the method.
5. Enabled route validation and provider activation/deactivation serialize under the same tenant advisory lock.
6. Checkout persists gateway + exact gateway config revision before provider I/O.
7. Route changes after Payment claim do not change that Payment's provider.
8. Credential rotation after Payment claim does not change that Payment's provider credentials.
9. Refund policy changes after Payment creation do not change that Payment's refund policy.
10. No cross-provider retry occurs after an ambiguous provider response.
11. Webhook/refund lifecycle continues resolving by Payment's historical gateway revision.
12. RLS and FORCE RLS apply to both new tenant-scoped tables.

## 13. Testing strategy

### 13.1 Contracts

Add tests for:

- routing request/response schemas;
- duplicate/unsupported method-provider pairs;
- mock-route environment guard;
- refund policy schema;
- capability map behavior.

### 13.2 Repository

TDD coverage for:

- SePay and PayOS both remain active after independent upserts;
- rotating PayOS deactivates only the previous PayOS revision;
- route uniqueness and atomic replacement;
- zero enabled routes;
- disabled route preserving an inactive provider selection;
- enabled route/inactive provider rejection under the shared advisory lock;
- tenant isolation and RLS architecture checks;
- refund policy read/write defaults.

### 13.3 Application

Checkout tests cover:

- `bank_transfer -> payos` while SePay is also connected;
- switch route to SePay affects only subsequent Payments;
- in-flight Payment stays on PayOS after route switch;
- provider credential rotation does not alter historical Payment resolution;
- Payment stores both refund policy snapshot fields;
- later policy edit does not alter old Payment refund planning;
- legacy Payment without snapshot uses historical gateway settings fallback;
- half-populated snapshot fails closed.

Public option tests cover:

- all four real providers active with five explicit methods;
- provider disabled makes its routed methods disappear;
- reconnect restores stored enabled routes;
- zero enabled routes gives no real methods;
- no configured effective route gives existing mock fallback only in allowed local mode.

### 13.4 Dashboard

Test:

- each provider form mutates only that provider;
- PayOS save does not deactivate/remove SePay UI state;
- checkout method selectors only show connected capable providers;
- routing save is atomic;
- disabled route warning state;
- refund policy form is independent from provider credential forms;
- ZaloPay method appears in the method list.

### 13.5 Regression gates

Before integration:

- `pnpm test`;
- `pnpm turbo lint typecheck build`;
- architecture/RLS checks;
- `pnpm smoke:local`;
- `pnpm smoke:infra:local`;
- focused live sandbox checkout tests for every configured real provider for which credentials are available locally.

No production deployment is part of this work unless separately authorized.

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

The tenant can later change only `bank_transfer -> sepay` without disconnecting PayOS and without affecting any Payment already created.

## 15. Rollout / rollback

### Rollout

1. deploy additive schema and compatibility reads;
2. backfill routes and tenant refund policies in the migration;
3. deploy API explicit routing/refund snapshot behavior;
4. deploy Dashboard split UI;
5. verify regression gates and real sandbox flows;
6. only then consider production release with explicit authorization.

### Rollback

Application rollback remains possible while legacy `TenantGatewayConfig.settings` is retained. New route/refund tables are additive. New Payment snapshot fields are additive and nullable.

Do not drop legacy settings or remove fallback code in the same release. That keeps rollback low-risk.

## 16. Acceptance criteria

The change is complete only when all are true:

- SePay and PayOS can both be active for one tenant.
- All real providers can remain connected simultaneously.
- Every enabled checkout method has exactly one explicit provider route.
- Zero enabled routes is a supported tenant state.
- No checkout method is inferred from `base` versus `wallet` grouping.
- No provider save disables a different provider.
- Public payment options are derived from explicit effective routes.
- Checkout snapshots exact gateway revision and refund policy before provider I/O.
- Historical payments/refunds preserve their provider and policy behavior.
- Dashboard has separate Provider, Checkout Methods and Refund Policy sections.
- Existing payment/refund/webhook tests remain green.
- New route/refund tables pass RLS/FORCE-RLS architecture gates.
- Local test can expose all five customer methods while SePay, PayOS, MoMo and ZaloPay are all connected.
