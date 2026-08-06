# DETAILED DESIGN DOCUMENT — BOOKING SAAS + MARKETPLACE PLATFORM

> Version: 1.0 · Date: 07/07/2026 · Status: Design pending approval

---

## Table of Contents

1. [Introduction & Goals](#1-introduction--goals)
2. [Terminology & Actors](#2-terminology--actors)
3. [Business Model & Money Flow](#3-business-model--money-flow)
4. [Overall Architecture & Technology](#4-overall-architecture--technology)
5. [Detailed Monorepo Structure](#5-detailed-monorepo-structure)
6. [Multi-tenancy & Data Isolation (RLS)](#6-multi-tenancy--data-isolation-rls)
7. [Detailed Data Model (per table)](#7-detailed-data-model-per-table)
8. [Booking State Machine](#8-booking-state-machine)
9. [Availability Engine per Booking Type](#9-availability-engine-per-booking-type)
10. [Double-booking Prevention](#10-double-booking-prevention)
11. [Payments: Plug-in Gateway, Deposits, Refunds](#11-payments-plug-in-gateway-deposits-refunds)
12. [Promotions & Discount Codes](#12-promotions--discount-codes)
13. [Commissions & Double-entry Ledger](#13-commissions--double-entry-ledger)
14. [3-tier RBAC — Dynamic Roles](#14-3-tier-rbac--dynamic-roles)
15. [Affiliate System](#15-affiliate-system)
16. [Theming & Vertical-specific Templates](#16-theming--vertical-specific-templates)
17. [Notifications (Email + Zalo ZNS)](#17-notifications-email--zalo-zns)
18. [i18n, Timezone, Currency Conventions](#18-i18n-timezone-currency-conventions)
19. [API Design](#19-api-design)
20. [Security](#20-security)
21. [Detailed Roadmap by Phase](#21-detailed-roadmap-by-phase)
22. [Testing Strategy](#22-testing-strategy)
23. [Risks & Open Decisions](#23-risks--open-decisions)
24. [Out of Scope — Future Backlog](#24-out-of-scope--future-backlog)

---

## 1. Introduction & Goals

Build a **"Booking Platform as a Service"** for the Vietnamese market, combining two models:

- **Multi-tenant SaaS**: each business customer (tenant) purchases a subscription and receives its **own booking website** — its own brand, its own domain, its own vertical-specific template UI (studio, Airbnb-style home rental, classes...).
- **Marketplace inside each tenant**: a tenant doesn't necessarily own its resources — **partners** list rentable resources on the tenant's site, the tenant takes a **commission** on every booking; **affiliates** refer customers and earn a commission from the tenant's share.

Concrete example:

- Tenant A = "StudioHub" — a platform for booking photo studios by the hour. Studio owners (partners) list their studios on StudioHub. Customers book and pay through the StudioHub site. StudioHub **defines its own service types**: studio, model booking, outfit rental, equipment rental, makeup — each type has its own booking mode and its own set of attributes (section 7.3).
- Tenant B = "StayVN" — a platform for renting homestays by the day (Airbnb-style). Homeowners are partners of StayVN.
- Both tenants run on **the same system**, differing only in UI template, domain, booking-mode configuration, and fee schedule.

**Phase 1 (MVP) goal**: get the studio vertical running — hourly + daily booking, **and quantity-based equipment/outfit rental (with security deposit)** — with SePay payment, commissions, basic discount codes, and a dashboard. The architecture is designed for the full model from day one.

---

## 2. Terminology & Actors

| Term                   | Definition                                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform**           | The central system operated by you (the platform owner). Collects subscription fees + a small % on each booking.                                                                                                             |
| **Tenant**             | A business that purchases a subscription and owns its own booking site (its own domain, theme, template).                                                                                                                    |
| **Partner**            | A partner who lists rentable resources **inside a tenant** (studio owner, homestay owner...). A partner belongs to exactly one tenant.                                                                                       |
| **Affiliate**          | Someone who refers customers to a tenant via a referral link/code, earning a commission on successful bookings.                                                                                                              |
| **Customer**           | The end customer — books and pays on the tenant's storefront.                                                                                                                                                                |
| **Resource / Listing** | **Listing** = the sellable unit shown on the storefront; **Resource** = the underlying calendar-holding unit (1:1 by default — multiple listings can point to the same resource to **share a calendar**, and never overlap). |
| **Booking mode**       | The listing's booking type: `hourly`, `daily`, `appointment` (service + staff), `class` (session with a seat count), `inventory` (quantity-based rental: outfits, equipment).                                                |
| **Listing type**       | A service category **defined by the tenant itself** (studio, model booking, outfit rental, makeup...) — carries a default booking mode + a customizable set of attributes.                                                   |
| **Booking Hold**       | A temporary hold (TTL ~10 minutes) while the customer is paying, to prevent double-booking by someone else.                                                                                                                  |
| **Commission Rule**    | The rule for computing commission: % for the platform, % the tenant takes from the partner, % for the affiliate.                                                                                                             |
| **Ledger**             | The double-entry book recording every money movement: who owes whom, balances of partner/affiliate/tenant/platform.                                                                                                          |
| **Payout**             | A payment run from the platform/tenant to a partner or affiliate.                                                                                                                                                            |

### User Roles (5 UI surfaces)

| Actor                        | Interface                     | Main tasks                                                                               |
| ---------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| Platform Admin (Super Admin) | `dashboard` `/admin` area     | Manage tenants, subscription plans, view the whole system, reconciliation                |
| Tenant Admin / Staff         | `dashboard` `/tenant` area    | Configure the site, approve partners, manage listings, bookings, commissions, affiliates |
| Partner Owner / Staff        | `dashboard` `/partner` area   | Manage own listings, availability, approve bookings, view revenue                        |
| Affiliate                    | `dashboard` `/affiliate` area | Get referral links, view recorded clicks/bookings, commission balance                    |
| Customer                     | `storefront`                  | Search, view availability, book, pay, manage own bookings                                |

---

## 3. Business Model & Money Flow

### 3.1. Platform Revenue Sources

1. **Tenant subscription fee** (Phase 1: managed manually — admin creates a plan, assigns it, the system enforces the expiry and limits; Phase 3: automatic recurring billing via a payment gateway).
2. **Platform fee**: a small % on every successful booking (e.g. 2%), deducted from the tenant's commission share.

### 3.2. Commission Chain on a Booking

Configured via `CommissionRule`, applied in priority order: **specific partner → listing type/category → tenant default** (commission can differ between studio, model booking, outfit rental...). Each rule can be `percent` or `fixed` (a flat amount).

### 3.3. Worked Example

Customer books a studio for 3 hours, total **2,000,000 ₫**, referred by an affiliate.
Configuration: tenant takes 15% from the partner; platform fee 2% (on the total booking, deducted from the tenant's share); affiliate 5% (on the total booking, deducted from the tenant's share).

| Party                     | Formula         | Amount          |
| ------------------------- | --------------- | --------------- |
| Total paid by customer    |                 | 2,000,000 ₫     |
| Partner receives          | 2,000,000 − 15% | **1,700,000 ₫** |
| Tenant commission (gross) | 15% × 2,000,000 | 300,000 ₫       |
| − Platform fee            | 2% × 2,000,000  | −40,000 ₫       |
| − Affiliate               | 5% × 2,000,000  | −100,000 ₫      |
| **Tenant net take**       |                 | **160,000 ₫**   |

> The system must validate when a tenant configures rates: `platform% + affiliate% ≤ tenant%` — otherwise the tenant's share goes negative; the UI must warn and block saving in that case. When a booking has a **promo code**, the calculation changes depending on who bears the discount cost — see section 12.4. For a **house partner** (tenant selling its own inventory — section 7.3), this constraint does not apply: the platform fee is computed directly on GMV, with no partner-payable step.

### 3.4. Physical Money Flow (Phase 1–2)

- Customer pays via SePay → money lands in **the tenant's own account** (each tenant configures its own merchant credentials).
- BookingOS records the payment as **held by the tenant**. After Partner completes the service, the
  system waits through the tenant-configured dispute period; only then does it record ledger entries:
  the tenant **owes** the partner/affiliate and **owes** the platform fee.
- The tenant pays out (payout) to partners/affiliates on a cycle (manual, marked in the system, with uploaded evidence). The platform issues a monthly fee reconciliation statement to the tenant.
- A later phase may move to a "platform collects on behalf of" model if legally permitted.

Detailed custody, split and recovery rules: [`docs/settlement-flow.md`](./docs/settlement-flow.md).

---

## 4. Overall Architecture & Technology

### 4.1. Overview Diagram

```
                    ┌──────────────────────────────────────────────┐
   Customer ──────▶ │  apps/storefront (React Router 7, SSR)        │
   (by tenant       │  studiohub.vn / stayvn.com / *.bookingos.vn     │
    domain)         └───────────────────────┬──────────────────────┘
                                            │ HTTP (REST, packages/shared)
   Tenant/Partner/  ┌──────────────────────▼──────────────────────┐
   Affiliate/Admin ▶│  apps/dashboard (React Router 7, SSR)        │
                    └───────────────────────┬──────────────────────┘
                                            │
                    ┌───────────────────────▼──────────────────────┐
                    │  apps/api (NestJS — clean/hexagonal)      │
                    │  modules: identity-access · tenancy · catalog │
                    │  scheduling · booking · payments · finance    │
                    │  affiliate · notification                     │
                    └──┬──────────────┬──────────────┬─────────────┘
                       │              │              │
                ┌──────▼─────┐ ┌──────▼─────┐ ┌──────▼──────────────┐
                │ PostgreSQL │ │ Redis      │ │ External adapters:   │
                │ (RLS,      │ │ (hold,     │ │ SePay adapters,      │
                │  ledger)   │ │  BullMQ)   │ │ SMTP/Resend, Zalo ZNS│
                └────────────┘ └────────────┘ └─────────────────────┘
```

### 4.2. Detailed Stack

| Layer                  | Technology                                                    | Notes                                                                                                      |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend               | React Router 7 (framework mode, SSR)                          | 2 apps: storefront + dashboard                                                                             |
| UI                     | Tailwind CSS + shadcn/ui                                      | In `packages/ui`, supports theming via CSS variables                                                       |
| Backend                | NestJS 11, strict TypeScript                                  | Hexagonal architecture (ports & adapters) per module                                                       |
| ORM                    | **Prisma** (locked in)                                        | `schema.prisma` is the source of truth for the data model; RLS via the `forTenant()` pattern (section 6.4) |
| DB                     | PostgreSQL 16 (+ `btree_gist`)                                | Shared schema, RLS, exclusion constraint against double-booking                                            |
| Cache / Queue          | Redis 7 + BullMQ                                              | Hold TTL, expiry jobs, notification sending, outbox relay                                                  |
| Validation & contracts | Zod in `packages/shared`                                      | A single shared schema source for FE/BE                                                                    |
| Auth                   | Session cookie (httpOnly) + refresh; Argon2id hashing         | Detailed in section 20                                                                                     |
| i18n                   | vi/en, resources in `packages/shared`                         | remix-i18next for RR7, nestjs-i18n for email                                                               |
| Dev infra              | docker-compose: postgres, redis, mailpit, minio               |                                                                                                            |
| Monorepo               | pnpm workspaces + Turborepo                                   |                                                                                                            |
| Testing                | Vitest (unit), Testcontainers (integration), Playwright (E2E) |                                                                                                            |

**File storage** (listing photos, tenant logo/favicon/hero/carousel, partner logo/license docs) — **implemented**: S3-compatible via a `StoragePort` (`apps/api/src/shared/storage/`, `S3StorageService`) — **MinIO** in docker-compose for dev (`pnpm --filter=api storage:init` creates the bucket), Cloudflare R2 / S3 for production. The browser uploads **directly** via a presigned PUT URL from `POST /uploads/presign` (`@AuthenticatedOnly`; input `{ target: 'listings'|'groups'|'partners'|'tenants', contentType }` → `{ uploadUrl, key, publicUrl }`); the API never proxies file bytes. Content types are an **image-only allowlist** (jpeg/png/webp/avif/gif, plus `.ico` for favicons); the S3 service generates a random UUID key (never trusts the client filename). There is **no** dedicated Media/Asset model — the returned URL is stored inline: `Listing.photos` / `ListingGroup.photos` (Json arrays), `Tenant.themeConfig` (logo/favicon/hero/carousel), `ListingType.icon` (String), `Partner.businessInfo` (logo/licenseDocs). On the frontend, each app needing uploads exposes a same-origin presign proxy resource route (e.g. `apps/dashboard/app/routes/uploads.presign.tsx`) that replays the auth cookie; the reusable `ImageUpload` / GenericForm `file` field then PUTs directly to storage. _Not yet implemented: server-side resize / CDN size-variants, and a delete/GC endpoint — originals are served as-is in dev._

### 4.3. Hexagonal Principles in `apps/api`

Each module (bounded context) has 3 layers, following this codebase's existing convention
(`apps/api/src/modules/*` and CLAUDE.md §5):

```
modules/booking/
├── domain/           # State machine, value objects, PORTs — NO Nest/Prisma imports
│   ├── booking-state-machine.ts (+ .spec.ts), cancellation-policy.ts, …   # pure domain (+ co-located specs)
│   └── ports/                              # interfaces + injection tokens
│       └── booking-repository.port.ts      # IBookingRepository + BOOKING_REPOSITORY (methods take a PrismaTx)
├── application/      # Use cases + the mapper; depends only on domain ports
│   ├── use-cases/create-booking.use-case.ts   # one class per file
│   └── booking.mapper.ts                       # domain → response DTO (the only place mapping lives)
└── infrastructure/   # ADAPTERs implementing the ports: Prisma repository, gateway clients, Redis hold store
    ├── repositories/prisma-booking.repository.ts
    └── http/                               # controllers split by audience + DTOs + NestJS module
        ├── public-booking.controller.ts    # storefront (tenant from Host)
        ├── tenant-booking.controller.ts    # dashboard (tenant scope)
        ├── partner-booking.controller.ts   # partner scope
        ├── dto/booking.dto.ts              # createZodDto(<schema from @booking/contracts>)
        └── booking.module.ts               # binds port → impl, registers use-cases + controllers
```

Dependency rule: `infrastructure → application → domain`. Ports (interfaces + their injection
tokens) live under `domain/ports/`; `infrastructure` only implements them (repository methods take a
`PrismaTx`, never the raw client), and the HTTP controllers/module live under `infrastructure/http/`
(no separate `interface/` layer). The **response mapper lives in `application/<context>.mapper.ts`**;
controllers are thin orchestrators that never build response objects inline. Controllers are split by
audience (`public-`/`tenant-`/`partner-`/`admin-`/`platform-`). Domain is pure TypeScript, testable
without a DB (specs are co-located as `*.spec.ts`).

Modules communicate via **domain events + the outbox pattern** (an `outbox_events` table, relayed by BullMQ) — e.g. `BookingCompleted` → the finance module records the commission ledger entries, the notification module sends an email. Modules never call each other's services directly.

---

### 4.4. Operations & Observability

- **Logging**: pino structured JSON, every log line carries `requestId` + `tenantId`; output to stdout → collector.
- **Error tracking**: Sentry for `api` and both RR7 apps (server + client).
- **Health checks**: `/health` (liveness) + `/health/ready` (checks DB/Redis) for the orchestrator; uptime monitoring per storefront domain.
- **Metrics**: count bookings/payments/webhook failures per tenant (Prometheus format); alert when payment webhooks fail repeatedly or the BullMQ queue backs up.
- **Backups**: daily pg_dump + WAL archiving (PITR), periodic restore drills. Redis only holds transient data (hold/cache/queue) — losing Redis does not break correctness thanks to DB-level constraints.

---

## 5. Detailed Monorepo Structure

> **This tree reflects the actual codebase as built** (12 API bounded contexts, 11 shared
> concerns, 5 workspace packages). Kept in sync with CLAUDE.md §2.1/§5 — update both together.

```
booking-saas/
├── apps/
│   ├── api/                                 # NestJS + Prisma — hexagonal, RLS-aware (PORT, default 3001)
│   │   ├── src/
│   │   │   ├── main.ts                       # bootstrap: Helmet, CORS allowlist, throttling, global guards/pipe/filter
│   │   │   ├── app.module.ts                 # root wiring — imports every shared + feature module
│   │   │   ├── modules/                      # 12 bounded contexts; EACH = domain/ · application/ · infrastructure/
│   │   │   │   ├── identity-access/          # Argon2id auth, rotating sessions, PermissionsGuard + resolver
│   │   │   │   ├── tenancy/                  # tenants, custom domains, plans, subscriptions, theme, settings/flags
│   │   │   │   ├── partner/                  # partner applications, approval, identity verification, payout info
│   │   │   │   ├── catalog/                  # listing-types (dynamic attribute schema) + public catalog search
│   │   │   │   ├── listing/                  # listings, groups, resources, pricing rules, moderation workflow
│   │   │   │   ├── scheduling/               # availability rules/exceptions, slot generation
│   │   │   │   ├── booking/                  # booking lifecycle, holds, cancellation, inventory, partner calendar
│   │   │   │   ├── payments/                 # checkout, gateway configs, webhooks, refunds
│   │   │   │   ├── promotions/               # promo codes, partner promotions, auto-campaigns
│   │   │   │   ├── finance/                  # commission rules, double-entry ledger, payouts
│   │   │   │   ├── affiliate/                # referral links, last-click attribution, commissions
│   │   │   │   └── notification/             # email (+ Zalo ZNS) dispatch + templates
│   │   │   └── shared/                       # cross-cutting infrastructure (no business logic)
│   │   │       ├── tenant-context/           # AsyncLocalStorage + TenantDbService.forTenant()
│   │   │       ├── prisma/                   # PrismaService (RLS app_user) + PrismaAdminService (BYPASSRLS)
│   │   │       ├── redis/                    # shared ioredis client (holds, BullMQ, permissions cache)
│   │   │       ├── outbox/                   # transactional outbox + BullMQ relay worker
│   │   │       ├── audit/                    # AUDIT_WRITER port — the single audit_logs write path
│   │   │       ├── storage/                  # S3/MinIO presign adapter + POST /uploads/presign
│   │   │       ├── validation/               # Zod validation pipe(s)
│   │   │       ├── openapi/                  # Swagger decorators/helpers (@ApiPaginatedResponse, @UuidParam…)
│   │   │       ├── health/                   # /health, /health/ready (Terminus: DB + Redis)
│   │   │       ├── money/                    # VND bigint format/parse
│   │   │       └── time/                     # UTC timezone helpers (DB is always UTC)
│   │   ├── prisma/{ schema.prisma · migrations/ (incl. hand-written RLS + tstzrange exclusion SQL) · seed.ts }
│   │   └── test/                             # e2e / integration (Testcontainers)
│   ├── storefront/                          # RR7 SSR — customer site, tenant resolved from Host (port 3000)
│   │   └── app/
│   │       ├── routes/                       # home, catalog t/:typeSlug, listing l/:listingSlug, checkout, bookings
│   │       ├── features/                     # catalog/ · listing/ · booking/ · checkout/ · partner/ (feature-based)
│   │       ├── templates/studio/             # vertical-specific storefront templates
│   │       ├── theme/                        # tenant theme_config → SSR-injected CSS variables
│   │       ├── layouts/
│   │       └── lib/*.server.ts               # api/session/auth server helpers; tenant from Host header
│   └── dashboard/                           # RR7 SSR — /admin /tenant /partner /affiliate (port 3002)
│       └── app/
│           ├── routes/{ admin · tenant · partner · affiliate · auth }/   # config-based routing
│           ├── features/{ admin · tenant · partner }/
│           ├── components/                   # app-specific layout/widgets (shared UI → packages/ui)
│           └── lib/*.server.ts               # api/session/auth; tenant from the login session
├── packages/
│   ├── contracts/  (@booking/contracts)     # zod schemas src/contracts/*.ts + inferred types + i18n (vi/en) — the FE+BE contract
│   ├── ui/         (@booking/ui)            # shadcn primitives, GenericForm, ImageUpload, Tailwind preset, theme CSS
│   ├── api-client/ (@booking/api-client)    # typed server-side HTTP client + interceptor + error types (used in loaders/actions)
│   ├── auth/       (@booking/auth)          # shared token + permission helpers
│   └── config/     (@booking/config)        # shared tsconfig · eslint · prettier · tailwind · vite presets
│                                            # (packages/shared is a deprecated artifact — contracts moved to @booking/contracts)
├── docker-compose.yml                       # postgres:16, redis:7, mailpit, minio
├── turbo.json · pnpm-workspace.yaml · tsconfig.base.json
└── CLAUDE.md · TONG-QUAN.md · README.md
```

**Module internal layout** (canonical hexagonal shape — `modules/listing/` is the richest example):

```
modules/<context>/
├── domain/
│   ├── ports/*.port.ts               # interface (IXxxRepository) + SCREAMING_SNAKE injection token
│   ├── <pure-domain>.ts (+ .spec.ts) # entities / value objects / state machines — zero framework imports
│   └── <sub>/                        # e.g. listing/domain/{moderation,pricing}/
├── application/
│   ├── use-cases/*.use-case.ts       # one class per file; inject ports only; one forTenant() per operation
│   │   └── <sub>/                    # e.g. listing/application/use-cases/moderation/
│   ├── <context>.mapper.ts           # domain → response conversion (the ONLY place mapping lives)
│   └── services/                     # app-layer helpers (validators, pricing) where needed
└── infrastructure/
    ├── repositories/prisma-*.repository.ts   # implement the ports; methods take a PrismaTx (never raw client)
    └── http/
        ├── <audience>-<context>.controller.ts # split by audience: public- / tenant- / partner- / admin-/platform-
        ├── dto/<context>.dto.ts               # createZodDto(<schema from @booking/contracts>)
        └── <context>.module.ts                # binds port → impl, registers use-cases + controllers
```

> Controllers are **thin orchestrators only** (validate input → resolve tenant/scope → call one
> use-case → map via `application/*.mapper.ts`). See `apps/api/docs/api-review-and-conventions.md`
> for the boundary rules and the next-module checklist.

---

## 6. Multi-tenancy & Data Isolation (RLS)

### 6.1. Tenant Resolution

- **Storefront**: by `Host` header. The `tenant_domains` table maps `hostname → tenant_id`. Supports both a default subdomain (`studiohub.bookingos.vn`) and a custom domain (`studiohub.vn`). RR7's root loader resolves the tenant and puts it into context; cached in Redis for 60s.
- **Dashboard & API**: the tenant is taken from **the login session** (which tenant the user belongs to) — the tenant_id sent by the client is never trusted. The platform admin has no tenant context (uses a connection that bypasses RLS, see 6.3).

### 6.2. RLS Design

Every tenant-scoped table has a `tenant_id uuid NOT NULL` column. Sample policy:

```sql
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON bookings
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### 6.3. Connections & DB Roles

| Postgres role | Used for                                                       | RLS                  |
| ------------- | -------------------------------------------------------------- | -------------------- |
| `app_user`    | Every request with a tenant context                            | Bound by RLS (FORCE) |
| `app_admin`   | Platform admin, migrations, system-wide reconciliation workers | `BYPASSRLS`          |

### 6.4. Prisma Integration

Each use case runs inside **a single interactive transaction**, with the GUC set on that same `tx` (setting it on a different connection silently disables RLS — a classic pitfall of the extension-per-operation pattern):

```ts
// shared/tenant-context/tenant-db.ts
async function forTenant<T>(
  tenantId: string,
  fn: (tx: PrismaTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`; // SET LOCAL — cleared when the tx ends
    return fn(tx); // every repository only ever receives `tx`; using the raw prisma client in business code is FORBIDDEN
  });
}
```

- NestJS middleware resolves the tenant → stores it in `AsyncLocalStorage`; use cases open a transaction via `forTenant()` — one tx per business operation (booking + promo-usage decrement + outbox all commit together), no nested transactions, and no pool exhaustion from opening a tx per query.
- **Background jobs & webhooks have no request context**: every job payload and every `outbox_events` row must carry `tenant_id`; workers wrap the handler in a tenant context. The payment webhook looks up `gateway_txn_id` (cross-tenant) using the `app_admin` connection to resolve the tenant before entering the tenant context.
- The app runs **two pools**: `app_user` (bound by RLS) for normal requests; `app_admin` (BYPASSRLS) for the platform admin, reconciliation workers, and webhook resolution.
- **CI RLS check**: an automated test cross-checks `pg_tables` — every table with a `tenant_id` column must have `FORCE ROW LEVEL SECURITY` + a policy; the build fails if a new table forgets this (the policy lives in hand-written SQL migrations, which Prisma does not track).
- Mandatory isolation test: tenant A can never read or write tenant B's rows, even if the code forgets a `where tenant_id` clause.

### 6.5. Enforcing Plan Limits

`subscription_plans.limits` (jsonb): `{ maxPartners, maxListings, maxBookingsPerMonth, customDomain: bool, affiliateModule: bool }`. A `PlanLimitGuard` checks before creation use cases; a tenant whose subscription has expired sees a "suspended" page on the storefront, and the dashboard becomes read-only. `maxBookingsPerMonth` is specifically a **soft limit**: it must never block an end customer's checkout (blocking a customer's transaction because of the tenant's quota must be avoided) — it only warns the tenant and suggests upgrading the plan.

**Tenant offboarding** (expired without renewal / voluntary cancellation): a 30-day grace period — **new** bookings are blocked, existing `confirmed` bookings are still completed or cancelled-and-refunded per policy; **partner/affiliate payout obligations are settled and paid out** before closing; data is retained for a further 90 days for tenant export (JSON/CSV) and is then anonymized.

---

## 7. Detailed Data Model (per table)

> General convention: PK `id uuid` (v7), with `created_at`, `updated_at`; money is `bigint` (VND); time is `timestamptz` (UTC). The columns listed below are the main business columns.
>
> **ORM locked in: Prisma.** The entire model below will be implemented in `apps/api/prisma/schema.prisma` (the single source of truth); anything Prisma cannot express — RLS policies, exclusion constraints (`btree_gist`), partial indexes, journal-balancing triggers — is written as **hand-written SQL inside a Prisma migration file**. _Status: implemented in `apps/api/prisma/schema.prisma` + migrations (the models below reflect the live schema; field names are camelCase in Prisma, snake_case in the DB via `@map`)._

### 7.1. Identity & Access Group

**users** — system-wide login accounts (every actor is a user)

| Column           | Type          | Notes                |
| ---------------- | ------------- | -------------------- |
| email            | citext unique |                      |
| password_hash    | text          | Argon2id             |
| full_name, phone | text          |                      |
| locale           | text          | `vi` / `en`          |
| status           | enum          | `active / suspended` |

**permissions** — fixed permission catalog (seeded from code, not creatable via UI)

| Column      | Notes                                         |
| ----------- | --------------------------------------------- |
| key         | e.g. `tenant.listings.write` (see section 14) |
| scope_level | `platform / tenant / partner`                 |

**roles** — dynamic roles

| Column      | Notes                                                   |
| ----------- | ------------------------------------------------------- |
| name        | "Branch Manager", "Accountant"...                       |
| scope_level | `platform / tenant / partner`                           |
| tenant_id   | null if scope is platform, or a system-wide shared role |
| partner_id  | null unless the role was created by a partner           |
| is_system   | a pre-seeded default role, not editable                 |

**role_permissions** — many-to-many between roles and permissions.

**role_assignments** — assigns a role to a user at a given scope

| Column                | Notes                                                             |
| --------------------- | ----------------------------------------------------------------- |
| user_id, role_id      |                                                                   |
| tenant_id, partner_id | defines the effective scope; unique (user, role, tenant, partner) |

### 7.2. Tenancy Group

**tenants**: name, slug, status (`active/suspended/expired`), default_timezone (default `Asia/Ho_Chi_Minh`), default_locale, vertical (`studio/rental/classes` — **only the storefront's default layout**, independent of listing type/mode; the actual menu is generated from listing_types), theme_config (jsonb — section 16), settings (jsonb).

**agreement_acceptances** — proof of terms acceptance: tenant_id, user_id/partner_id, agreement_type (`partner_terms / commission_schedule / promo_funding / customer_terms / privacy_policy / affiliate_terms`), document_version_id, accepted_locale, version, accepted_at, ip. The four document-backed types point at an immutable `legal_document_versions` row and record the language actually rendered, so the exact text a person agreed to can always be reproduced — see [`docs/features/legal-documents.md`](./docs/features/legal-documents.md). `partner_terms` is recorded when the partner ticks the box on their own application, **not** when the tenant approves them. Still open: when a tenant **changes a commission rule** applied to a partner, notify the partner + (depending on tenant config) require re-acceptance of the new version — this needs commission rules to be versioned, so `commission_schedule` is still written by the tenant at approval against a constant.

**legal_documents / legal_document_versions / legal_document_translations** — the tenant-authored terms themselves. A tenant serves no storefront until all four required documents are published in its `default_locale` (the hard gate). A version is the agreement and is immutable once published; translations hang below it because `vi`/`en` are two renderings of one agreement. See [ADR 0008](./docs/decisions/0008-legal-documents-and-consent.md).

**tenant_domains**: tenant_id, hostname (unique), is_primary, verified_at.

**subscription_plans**: name, price_monthly (bigint), limits (jsonb), is_active.

**tenant_subscriptions**: tenant_id, plan_id, status (`trial/active/past_due/expired/cancelled`), starts_at, expires_at, note (admin note for manual invoicing).

### 7.3. Catalog Group

**partners**: tenant_id, name, slug, description, **partner_type** (`individual` — freelancer / `company`), business_info (jsonb — tax ID, business registration if a company, plus **`logoUrl` + `licenseDocs[]`** uploaded images — partners have no dedicated image column), status (`pending/approved/suspended` — the tenant approves the partner), contact info, payout_info (jsonb — bank account for receiving payouts). Registration is anonymous (storefront `become-partner`); the logo + license documents are uploaded **after** account creation on the authenticated dashboard partner-profile page (`PATCH /partner/profile/documents`), since the presign endpoint requires a logged-in user.

A partner offers **multiple services across multiple listing types** — e.g. on StudioHub, company X might have 10 "Studio" listings + 10 "Model" listings + several "Equipment rental" listings; each listing belongs to one listing_type, and either has its own calendar or **shares a calendar** via `resources` below.

**Internal partner (house partner)** — the tenant sells its own resources (a tenant that "already has 10 models"): create a partner with the **`is_house = true`** flag, owned by the tenant. It has its own bookkeeping branch: **no** partner payable / payout (the money was already the tenant's); the platform fee is computed directly on GMV; affiliate commission is still deducted from the tenant's share; the `platform% + affiliate% ≤ tenant%` constraint **does not apply**. This is how most tenants start (selling their own inventory first, opening the marketplace later).

**Identity verification** (Phase 1, mandatory for people-related listing types — models, makeup artists): an `individual` partner submits a national ID (name matched against `payout_info`) + date of birth — **blocking under-18** for people-booking listing types; the terms of service explicitly ban disguised services. Automated eKYC: Phase 3.

> **Suspending a partner / archiving a listing while future `confirmed` bookings exist**: the system blocks the action, or requires it to go through a "bulk cancel + 100% refund + notify customers" flow — a booking must never be left orphaned (a customer arriving to a closed door).

**partner_members**: partner_id, user_id (their role lives in role_assignments).

**listing_types** — a service category **defined by the tenant** (dynamic, not hard-coded)

| Column                       | Notes                                                                                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tenant_id                    |                                                                                                                                                                                                                             |
| name, slug, icon             | e.g. tenant StudioHub creates: "Studio", "Model Booking", "Outfit Rental", "Equipment Rental", "Makeup"                                                                                                                     |
| allowed_modes, default_modes | which modes this type is **allowed to enable** + enabled by default when creating a listing — e.g. "Studio" allows `[hourly, daily]`, "Model" `[hourly, daily]`, "Equipment Rental" `[inventory]`, "Makeup" `[appointment]` |
| attribute_schema             | jsonb — defines the type's custom fields: `[{key, label, type: text/number/select/multiselect/boolean, required, filterable, options}]`                                                                                     |
| unit_label                   | display unit for price: "hour", "day", "session", "set"...                                                                                                                                                                  |
| sort_order, is_active        | controls menu/ordering on the storefront                                                                                                                                                                                    |

Example `attribute_schema`: "Model Booking" → height, measurements, style, portfolio link; "Equipment Rental" → brand, model, specs, included accessories; "Makeup" → style, duration, on-location availability. Fields marked `filterable` automatically become storefront filters.

**listing_groups** — a "parent" post grouping multiple listings (a Studio post containing multiple Rooms; a Photographer post containing multiple Service Packages)

| Column                    | Notes                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| tenant_id, partner_id     |                                                                                                          |
| listing_type_id           | Studio / Photographer / ...                                                                              |
| title, slug, description  |                                                                                                          |
| address, working_area     | studio address or working area                                                                           |
| latitude, longitude       | exact WGS84 point used by the storefront's category-aware nearby recommendations; the partner picks a Nominatim/OpenStreetMap address result or captures the venue's current GPS position |
| photos                    | the post's shared photo album (first photo used as the cover)                                            |
| amenities                 | jsonb ordered rows `[{label, icon}]`; each icon is a tenant-chosen Lucide name from the shared allowlist |
| status                    | `draft / pending_review / published / archived` — **moderated at the post level**                        |
| published_by, hidden_by   | `partner / admin` — a post **hidden by admin** cannot be re-enabled by the partner (a domain rule)       |
| rating_avg, booking_count | denormalized for display + sorting (`rating_avg` only used once reviews are enabled — section 24)        |

Customers **do not book "the post"** — they book a **child listing** (room/package) inside it: bookings, calendars, prices, holds, overlap checks, and money all stay at the listing level; `listing_groups` is purely a display + moderation layer. A listing can still stand alone (`group_id = null`) for simple types (equipment, outfits). Post-level amenities (reception, parking...) live on the group; room-level amenities (AC, changing room...) remain attributes of the listing — two separate master-data lists.

**resources** — the calendar-holding unit of a partner

| Column                | Notes                                                 |
| --------------------- | ----------------------------------------------------- |
| tenant_id, partner_id |                                                       |
| name                  | "Studio A", "Model Ngoc Anh", "Sony FX3 camera #2"... |
| timezone              | defaults to the tenant's                              |

Each listing generates its own resource 1:1 by default. When **a single physical resource is sold through multiple listings** — Studio A has both an hourly-booking listing and a listing inside a combo package; Model Ngoc Anh has both her own listing and a spot in a lookbook package — those listings point to the **same resource** → an absolutely shared calendar, with the exclusion constraint on `resource_id` so it can never double-book regardless of which listing was used.

**listings**

| Column                                                        | Notes                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tenant_id, partner_id                                         |                                                                                                                                                                                                                                                                                   |
| listing_type_id                                               | listing type (required) — determines the input form + filters                                                                                                                                                                                                                     |
| resource_id                                                   | the calendar-holding unit — auto-generated 1:1 by default; points to a shared one when needed                                                                                                                                                                                     |
| group_id                                                      | parent post (`listing_groups`, nullable) — null = standalone listing needing no parent page                                                                                                                                                                                       |
| attributes                                                    | jsonb — attribute values, **validated against the listing type's `attribute_schema`**                                                                                                                                                                                             |
| title, slug, description, photos (jsonb)                      |                                                                                                                                                                                                                                                                                   |
| latitude, longitude                                           | exact WGS84 point for standalone listings; grouped listings inherit the group's storefront location. The create/edit form supports explicit address geocoding and on-site GPS capture.                                                                                            |
| booking_modes                                                 | **array of enabled modes**, e.g. `[hourly, daily]` — the partner toggles these freely (a studio/model listing can allow both hourly and daily booking); valid values are limited by the listing_type's `allowed_modes`                                                            |
| stock_quantity                                                | number of units in stock (`inventory` mode only — e.g. 10 outfits, 3 cameras)                                                                                                                                                                                                     |
| status                                                        | `draft / pending_review / published / archived` — if part of a group, moderation happens at the post level; a standalone listing is moderated directly as its own post                                                                                                            |
| published_by, hidden_by                                       | `partner / admin` — same as listing_groups, used to hide/show individual rooms/packages                                                                                                                                                                                           |
| mode_config                                                   | jsonb — per-enabled-mode config. A `flexible_duration` type stores unit price + min/max and an empty `packages` array. A `fixed_packages` type stores packages with stable UUID, name, optional description, up to 8 ordered photo URLs (first photo is the cover), absolute VND price, active state, sort order and `durationMinutes`/`durationDays`; base price and min/max are not used. Legacy `blocks` are ignored and stripped on save. |
| buffer_before, buffer_after                                   | minutes of cleanup/prep time between two bookings                                                                                                                                                                                                                                 |
| capacity                                                      | max number of guests (class: number of seats)                                                                                                                                                                                                                                     |
| category_id                                                   | classification within the tenant                                                                                                                                                                                                                                                  |
| approval_required                                             | bool — enables request-to-book                                                                                                                                                                                                                                                    |
| deposit_percent                                               | 0–100; 100 = pay in full                                                                                                                                                                                                                                                          |
| balance_due                                                   | `online_before / on_arrival` — how the remaining balance is paid (section 8.3)                                                                                                                                                                                                    |
| reschedule_allowed, reschedule_deadline_hours, reschedule_fee | reschedule configuration (section 8.4)                                                                                                                                                                                                                                            |
| cancellation_policy_id                                        |                                                                                                                                                                                                                                                                                   |
| ~~timezone~~                                                  | the calendar uses `resources.timezone` (one calendar, one timezone — avoids two listings sharing a resource drifting apart)                                                                                                                                                       |

**Quality Control & Leakage Prevention (Phase 1)**

- A new post (`listing_groups`) or standalone listing goes into `pending_review` — the tenant reviews it before it can reach customers; minimum submission checklist: ≥ N photos, description, price, cancellation policy.
- **Every later edit is reviewed too, without taking the listing offline.** A partner editing something already reviewed does not write to the live row: the change is parked as the target's single pending **revision** (`listing_revisions`), and saving IS the submission — no second "submit" step, no hiding the post first. Customers keep seeing the approved version until a reviewer approves the change, which then applies through the ordinary update path (so attribute schema, mode config, deposit coverage and slug rules are re-validated) and re-runs the checklist + contact scan on the edited content. Rejection keeps the live version and returns a required note to the partner, who keeps their edit in the form. Posts are decided as a unit: the post's own edit plus every edited item. Drafts are still written in place. Auto-publishing later edits (configurable per tenant) remains open — see [ADR 0007](./docs/decisions/0007-listing-edit-revisions.md).
- Hide/show actions record their source (`published_by` / `hidden_by`): a post **hidden by admin** cannot be re-enabled by the partner — only an admin can unlock it; every hide/show action goes into the audit log.
- **Contact information is banned** in listing descriptions/photos (phone numbers, Zalo, external links) — scanned via regex at review time; a partner's contact details are only revealed to the customer **after the booking is confirmed**. Reason: preventing disintermediation — a partner pulling customers off to Zalo to dodge commission is the #1 risk of any marketplace; cyclical payouts + a holding period only increase the incentive. In-app chat between customer↔partner: Phase 2.
- A signed-in storefront customer can report a published standalone listing or listing group. The report snapshots the target title/slug and partner/reporter display names, is isolated by tenant RLS, and appears in the tenant moderation inbox. One customer can have only one active (`open` or `reviewing`) report per target; tenant reviewers move it to `resolved` or `dismissed` with a required resolution note. Reporting never hides content automatically: the reviewer uses the existing listing moderation workflow, and every report state change is written to the audit log.
- Published listing and group detail pages link to a tenant-scoped public provider profile. It exposes only the partner's safe display fields, verification/tenure, published offering counts, completed bookings and verified reviews; contact, payout and identity-document data never cross the public API.

**pricing_rules** — conditional pricing (Phase 1 only needs weekday/weekend + time windows)

| Column       | Notes                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| listing_id   |                                                                                                                                                                                |
| booking_mode | which mode the rule applies to (`hourly`/`daily`/`inventory`) — required since base price is split per mode                                                                    |
| rule_type    | `day_of_week / date_range / time_range / date_time_range`                                                                                                                        |
| params       | jsonb, e.g. `{days:[6,0], from:"18:00", to:"22:00"}` or `{date:"2026-07-20",from:"18:00",to:"22:00"}`                                                                     |
| price        | bigint — regular per-unit price replacing `basePrice`; pricing rules apply only to flexible-duration pricing and are ignored for fixed packages                                      |
| sale_price   | nullable bigint — partner-funded calendar sale; greater than zero and lower than `price`; promotion codes apply after this price                                                   |
| priority     | higher-priority rule wins                                                                                                                                                      |

**categories**: tenant_id, name, slug (used for category-based commission rules + storefront filtering).

### 7.4. Scheduling Group

**availability_rules** — weekly recurring opening hours

| Column                | Notes                                 |
| --------------------- | ------------------------------------- |
| listing_id            |                                       |
| day_of_week           | 0–6                                   |
| open_time, close_time | local time in the resource's timezone |

**availability_exceptions** — date-specific exceptions: **resource_id** (not listing — a maintenance/holiday block must affect EVERY listing sharing that calendar), date, type (`closed / custom_hours`), open_time, close_time, reason. `(resource_id, date)` is unique; saving a day replaces its previous exception.

### 7.5. Booking Group

**bookings**

| Column                            | Notes                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| tenant_id, listing_id, partner_id | partner_id denormalized for fast queries                                                                                                         |
| resource_id                       | denormalized from the listing — **the double-booking lock key** (exclusion constraint)                                                           |
| booking_mode                      | the mode the customer selected (`hourly`/`daily`/...) when a listing has multiple modes enabled                                                  |
| customer_id                       | the booking user                                                                                                                                 |
| code                              | short booking code shown to the customer, e.g. `BK-7F3K9Q`                                                                                       |
| idempotency_key                   | unique per tenant — a client retry creating a booking returns the existing booking instead of creating a duplicate                               |
| status                            | see the state machine in section 8                                                                                                               |
| timeslot                          | `tstzrange` — [start, end) UTC; daily: [check-in 14:00, check-out 12:00)                                                                         |
| blocked_period                    | `tstzrange` — timeslot expanded by buffer (snapshotted at booking time), used for the exclusion constraint                                       |
| guest_count                       |                                                                                                                                                  |
| additional_charges                | jsonb — extra charges the partner adds before `completed` (overtime, surcharges); commission is computed on this like an `on_arrival` amount     |
| quantity                          | number of units rented (`inventory` mode; 1 for other modes)                                                                                     |
| total_amount                      | bigint — total after pricing rules, **before discount**                                                                                          |
| promotion_id, promo_code          | null if no code applied (recorded at creation time, immutable)                                                                                   |
| discount_amount                   | bigint — amount discounted by the promotion (0 if none)                                                                                          |
| final_amount                      | bigint — amount the customer must pay at checkout = total_amount − discount_amount (**excludes** `additional_charges` added later — section 8.3) |
| promotion_snapshot                | jsonb — snapshot of the promotion config at booking time (type, value, funded_by)                                                                |
| deposit_amount                    | bigint — the amount due at booking time (computed on final_amount)                                                                               |
| paid_amount                       | bigint — the amount actually paid                                                                                                                |
| affiliate_id, referral_code       | null if none (recorded at creation time, immutable)                                                                                              |
| cancellation_policy_snapshot      | jsonb — snapshot of the policy at booking time                                                                                                   |
| pricing_snapshot                  | jsonb — price breakdown at booking time                                                                                                          |
| listing_snapshot                  | jsonb — immutable listing title/slug/content, attributes + attribute schema/icons, capacity and group link at booking time                        |
| commission_snapshot               | jsonb — the % rates applied at booking time (immutable even if the rule later changes)                                                           |
| customer_note, partner_note       |                                                                                                                                                  |
| expires_at                        | payment/approval deadline while pending                                                                                                          |

**booking_holds**: resource_id, listing_id, timeslot (tstzrange), session_id/customer_id, expires_at. Redis (TTL) is the source of truth; this table is only for audit purposes. Holds are factored into availability checks.

**booking_status_history**: booking_id, from_status, to_status, actor_id, reason, created_at — full audit trail of every status transition.

**cancellation_policies**: tenant_id, name, rules (jsonb) — a tiered array, e.g.:

```json
[
  { "hoursBefore": 168, "refundPercent": 100 },
  { "hoursBefore": 48, "refundPercent": 50 },
  { "hoursBefore": 0, "refundPercent": 0 }
]
```

### 7.6. Payments Group

**payments**: booking_id, tenant_id, gateway (`sepay/payos/momo/vnpay/mock`), kind (`deposit/balance/full/security_deposit` — a refundable deposit, not revenue), amount, status (`pending/succeeded/failed/expired`), gateway_order_ref, gateway_order_id, gateway_txn_id, payment_method, gateway_payload (jsonb), idempotency_key (unique), paid_at.

**refunds**: payment_id, booking_id, amount, status (`pending/succeeded/failed/manual_required`), reason, gateway_refund_id. (`manual_required`: the gateway doesn't support a refund API → creates a task for the tenant to do a manual bank transfer.)

**tenant_gateway_configs**: tenant_id, gateway, credentials (jsonb, **encrypted with AES-256-GCM at the app layer**), is_active, environment (`sandbox/production`).

### 7.7. Finance Group

**commission_rules**

| Column                                     | Notes                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| tenant_id                                  |                                                                           |
| applies_to                                 | `tenant_default / listing_type / category / partner`                      |
| listing_type_id / category_id / partner_id | depending on applies_to                                                   |
| tenant_rate_type, tenant_rate              | `percent/fixed`, the tenant's commission taken from the partner           |
| platform_rate                              | platform fee % (only editable by the platform admin, set per plan/tenant) |
| affiliate_rate_type, affiliate_rate        | default affiliate commission                                              |
| effective_from, effective_to               | time-bound effectiveness                                                  |

**booking_settlements**: tenant_id, booking_id, payment_id, partner_id, status
(`held/dispute_window/disputed/refund_pending/released/refunded`), kind
(`service_completed/customer_no_show/cancellation_fee`), online_held_amount,
onsite_collected_amount, security_deposit_held, tenant_commission_gross, tenant_net_earning,
partner_gross_earning, partner_payable, platform_fee, affiliate_commission, completed_at,
refunded_amount, retained_amount, refund_id, dispute_until, released_at, release_journal_id. This is the custody/read lifecycle; payment success
does not itself create earnings.

**settlement_disputes**: booking_id, settlement_id (**unique: one claim per settlement**), customer
reason/evidence, one Partner response, status/resolution, refund amount, resolver and timestamps. An
open dispute locks release. Partial refund totals are cumulative and can never exceed the service
amount still held.

**ledger_accounts** — one account per party per tenant: owner_type (`platform/tenant/partner/affiliate`), owner_id, tenant_id, currency (`VND`).

**ledger_entries** — double-entry bookkeeping, **immutable (append-only, no UPDATE/DELETE)**

| Column                            | Notes                                                                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| journal_id                        | groups the lines of a single business transaction                                                                                                                                                  |
| account_id                        |                                                                                                                                                                                                    |
| debit, credit                     | bigint, exactly one column > 0                                                                                                                                                                     |
| booking_id, payment_id, payout_id | business references                                                                                                                                                                                |
| entry_type                        | `booking_revenue / partner_share / platform_fee / affiliate_commission / promo_discount / cancellation_fee / additional_charge / security_deposit / damage_deduction / clawback / refund / payout` |

Constraint: total debit = total credit within each `journal_id` (checked at the domain layer + a deferred trigger constraint).

**payouts**: tenant_id, payee_type (`partner/affiliate`), payee_id, amount, period_from/to, status (`pending/processing/paid/failed`), paid_at, evidence (jsonb — transfer reference number, evidence file), created_by. **payout_allocations** maps a released booking settlement amount to one payout (`reserved → paid/released`) so failures can safely return it to a later cycle. A Partner payout must be covered exactly by its FIFO allocations or creation rolls back. Payout policy is configured per tenant: **minimum amount**, **cycle** (weekly/monthly), **holding period**. The holding period is applied before the settlement revenue journal is created; payout eligibility must not apply the same delay a second time. A `failed` payout releases its allocations to be rolled into the next cycle.

### 7.8. Affiliate Group (Phase 2)

**affiliates**: tenant_id, user_id, status (`pending/approved/suspended`), custom_rate (overrides the default rate, nullable), payout_info (jsonb).

**referral_links**: affiliate_id, code (unique within the tenant), target (`tenant_home/listing`), listing_id, clicks_count.

**referral_clicks**: referral_link_id, visitor_id (cookie), ip_hash, user_agent, created_at. Cookie window: 30 days (configurable per tenant), **last-click wins**.

**affiliate_commissions**: affiliate_id, booking_id, amount, status (`pending → confirmed → paid / reversed / clawed_back`). `pending` when the booking is confirmed; `confirmed` when the booking is completed (after the service date); `reversed` if refunded/cancelled before completion; `clawed_back` if disputed after already being paid — deducted from the next payout cycle.

### 7.9. Promotions Group (business rules detailed in section 12)

**promotions**

| Column                                      | Notes                                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| tenant_id                                   |                                                                                                                                                 |
| name                                        | program name (shown internally + on the storefront)                                                                                             |
| code                                        | the code customers enter, unique within the tenant, uppercase; null = an auto-applied campaign (Phase 2)                                        |
| discount_type, discount_value               | `percent` (with `max_discount` — a cap on the discount amount) or `fixed` (a flat amount)                                                       |
| funded_by                                   | `tenant / partner` — who bears the discount cost (determines commission calc, section 12.4)                                                     |
| applies_to                                  | `all / listing_type / listing_group / category / listing / partner` + the corresponding id (applying to a group applies to every child listing) |
| min_order_amount                            | minimum booking value to apply the code                                                                                                         |
| first_booking_only                          | bool — only applies to a customer's first booking in the tenant                                                                                 |
| usage_limit_total, usage_limit_per_customer | null = unlimited                                                                                                                                |
| redeemed_count                              | number of uses so far (incremented atomically, race-safe)                                                                                       |
| starts_at, ends_at                          | effective period                                                                                                                                |
| status                                      | `draft / active / paused / ended`                                                                                                               |
| created_by_partner_id                       | null = created by the tenant; Phase 2: partners create their own codes for their own listings                                                   |

**promo_redemptions** — each use of a code is tied to a booking

| Column                                         | Notes                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| promotion_id, booking_id (unique), customer_id |                                                                                                                                      |
| discount_amount                                | the actual discount amount for this booking                                                                                          |
| status                                         | `reserved` (booking still pending) → `applied` (confirmed) → `released` (expired/rejected/100%-refund cancellation — usage returned) |

### 7.10. Infrastructure Group

**outbox_events**: tenant_id, aggregate_type, aggregate_id, event_type, payload (jsonb), status (`pending/processed/failed`), processed_at — the relay worker reads these and dispatches to handlers (notification, finance...); `tenant_id` is required so the worker can reconstruct the tenant context (section 6.4).

**audit_logs**: tenant_id, actor_id, action, entity_type, entity_id, before/after (jsonb), ip — for sensitive actions (role changes, commission rule changes, promotion changes, hide/show a post, payouts, refunds).

### 7.11. Key Relationships (simplified ERD)

```
tenants 1─n tenant_domains
tenants 1─n listing_types 1─n listings (attributes validated against attribute_schema)
partners 1─n listing_groups 1─n listings (a post contains multiple rooms/packages; group_id nullable)
tenants 1─n partners 1─n listings 1─n availability_rules / pricing_rules
partners 1─n resources 1─n listings (multiple listings pointing to the same resource = a shared calendar)
listings 1─n bookings n─1 users(customer)
bookings 1─n payments 1─n refunds
bookings 1─1 booking_settlements 1─n settlement_disputes
booking_settlements 1─n payout_allocations n─1 payouts
bookings 1─1 commission_snapshot ──▶ ledger_entries (via a journal when completed)
tenants 1─n promotions 1─n promo_redemptions n─1 bookings
tenants 1─n affiliates 1─n referral_links 1─n referral_clicks
affiliates 1─n affiliate_commissions n─1 bookings
users n─n roles (role_assignments, scoped by tenant/partner)
```

---

## 8. Booking State Machine

### 8.1. Transition Paths (summary)

> The transition table in 8.2 is **the single source of truth**; the diagram below is only a summary.

```
draft ────(hold expired, customer never checked out)──────▶ expired (cleanup, release promo)
draft ────(no approval needed)─────────────────────────────▶ pending_payment
draft ────(approval_required)──────────────────────────────▶ pending_approval
pending_approval ──(partner approves)─────────────────────▶ pending_payment
pending_approval ──(rejected / approval deadline passed)───▶ rejected
pending_payment ───(payment webhook OK)────────────────────▶ confirmed
pending_payment ───(payment deadline passed)───────────────▶ expired
expired ───────────(late webhook + slot still free)────────▶ confirmed   (slot already taken → auto-refund)
confirmed ─────────(customer cancels: refund per policy)───▶ cancelled
confirmed ─────────(partner/tenant cancels: 100% refund)───▶ cancelled
confirmed ─────────(partner/tenant confirms after usage)───▶ completed
confirmed ─────────(nobody acted within 24h after end: job)▶ completed
confirmed ─────────(partner marks within ≤23h after end)───▶ no_show
cancelled ─────────(refund succeeds at the gateway)─────────▶ refunded
completed ─────────(dispute/clawback — rare)────────────────▶ refunded
```

### 8.2. Transition Table

| From               | To                 | Condition / Actor                                               | Side effects                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —                  | `draft`            | Customer selects a slot; the Redis hold is created successfully | Creates a hold with a 10' TTL                                                                                                                                                                                                                                                        |
| `draft`            | `pending_payment`  | Listing doesn't require approval                                | Creates a payment intent at the gateway; `expires_at = now + 15'`                                                                                                                                                                                                                    |
| `draft`            | `pending_approval` | `approval_required = true`                                      | Notifies the partner; `expires_at = now + 24h` (configurable)                                                                                                                                                                                                                        |
| `draft`            | `expired`          | Job fires when the hold TTL expires without checkout            | Cleans up the orphaned draft; releases the promo redemption (a draft is never part of the exclusion constraint)                                                                                                                                                                      |
| `pending_approval` | `pending_payment`  | Partner clicks approve                                          | Notifies the customer with a payment link                                                                                                                                                                                                                                            |
| `pending_approval` | `rejected`         | Partner rejects / deadline passes (job)                         | Releases the hold; releases the promo redemption; notifies the customer                                                                                                                                                                                                              |
| `pending_payment`  | `confirmed`        | Gateway webhook reports success (idempotent)                    | Writes the booking to the calendar (exclusion constraint); fires `BookingConfirmed` → email/ZNS; affiliate_commission `pending`                                                                                                                                                      |
| `pending_payment`  | `expired`          | BullMQ job when `expires_at` passes                             | Locks the booking (`FOR UPDATE`, avoiding a race with the webhook); **cancels the payment intent at the gateway first** before transitioning; releases the hold; releases the promo redemption                                                                                       |
| `expired`          | `confirmed`        | A success webhook arrives **late**, slot still free             | Restores the booking (re-checks the exclusion constraint); **re-reserves the promo redemption** (re-increments redeemed_count — accepting a temporary limit overshoot, keeping the discount snapshot); if the slot was already taken → auto-creates a refund + notifies the customer |
| `confirmed`        | `cancelled`        | **Customer** cancels                                            | Refund per the policy snapshot; the retained portion is recorded as a `cancellation_fee` journal entry (split per commission_snapshot); affiliate goes `reversed`; promo `released` if fully refunded                                                                                |
| `confirmed`        | `cancelled`        | **Partner/tenant** cancels                                      | **Always** a 100% refund regardless of policy (the policy only applies to customer cancellations; consider a partner penalty); affiliate goes `reversed`; promo `released`                                                                                                           |
| `cancelled`        | `refunded`         | Refund succeeds at the gateway                                  | Closes the money lifecycle                                                                                                                                                                                                                                                           |
| `confirmed`        | `completed`        | Partner/Tenant confirms after `timeslot.end`                    | Freezes on-site collection and opens `dispute_window`; the journal is written only when settlement releases                                                                                                                                                                          |
| `confirmed`        | `completed`        | Job: 24h past `timeslot.end` and nobody acted                   | Same side effects, but the event carries no on-site figure, so the settlement assumes the outstanding balance was collected. An `inventory` booking instead goes through an auto-return (no damage, no late fee) so its security deposit is still released. Exists so a settlement cannot sit in `held` forever, denying the customer a dispute window — see section 8.5 |
| `confirmed`        | `no_show`          | Partner marks after the slot ends and within 23h                | Opens the tenant-configured dispute window on the **actual online service amount** and separately refunds the full security deposit; no revenue/payable is released before the deadline — see section 8.5                                                                          |
| `completed`        | `refunded`         | Dispute/clawback after completion (tenant's decision)           | A reversing journal (`clawback`); the partner/affiliate balance can go **negative** → deducted from the next payout; affiliate goes `clawed_back`                                                                                                                                    |

Every transition goes through a single domain function (`booking.transitionTo(next, ctx)`) — validating, writing `booking_status_history`, firing the domain event. Status is never updated directly anywhere else.

### 8.3. Paying the Remaining Balance (deposit)

If `deposit_percent < 100`: the booking becomes `confirmed` after paying the deposit; the remainder creates a `kind=balance` payment with a due date (default: before the usage time, or paid on-site — configured on the listing as `balance_due: online_before | on_arrival`). Reminders are sent via a job. If not paid on time (for `online_before`): the tenant configures whether to auto-cancel per policy or keep the booking.

**Extra charges (overtime, surcharges)** — a routine occurrence in the studio industry: the partner adds a line to the booking's `additional_charges` **before** `completed` (the customer is notified); this amount has commission computed on it just like an `on_arrival` amount (the partner collects on the platform's behalf). Without this mechanism, overtime charges would be collected in cash outside the system — real GMV would exceed recorded GMV, and the tenant would miss out on commission in its core vertical.

### 8.4. Reschedule — Phase 2

- The customer (or the partner proposes, the customer confirms) moves to a different slot on the **same listing**. Configured per listing: allowed/not allowed, deadline (`reschedule_deadline_hours`), reschedule fee (optional).
- Technically: a single transaction — validate the new slot (still subject to the exclusion constraint), update `timeslot`, write a `booking_status_history` entry of type `rescheduled` (status stays `confirmed`), notify both parties.
- If the new slot's price differs: the difference creates an additional payment or a partial refund; `pricing_snapshot` is updated, `commission_snapshot` stays unchanged.
- Anti-abuse: the promo's `discount_amount` stays **absolute** (not recalculated against the new price's conditions); a cap on the number of reschedules (default 1); the cancellation-policy cutoff uses the **max** of (old slot's cutoff, new slot's cutoff) — so a cancellation fee can't be dodged by rescheduling right before the cutoff.

### 8.5. No-show (customer doesn't show up) — Phase 1

- The partner marks `no_show` after `timeslot.end` and within 23h. One hour later — 24h past `timeslot.end` — a scheduled sweep closes any still-`confirmed` booking on its own. The hour between the two deadlines is a guard band so a late no-show cannot race the sweep; inside it the partner may still complete manually but no longer mark no-show.
- The sweep is a **deadline, not an inference of success**: the partner keeps the entire window to say otherwise. It exists because a booking left in `confirmed` leaves its settlement in `held` forever — no dispute window ever opens, so the customer can never file a claim and the money never leaves custody. The auto-completion event reports no on-site amount, so the settlement falls back to its expected outstanding: for an `on_arrival` booking the partner is assumed to have taken the cash, and their payable is reduced accordingly. That risk is the price of not acting within 24h, and the partner is emailed when it happens.
- An `inventory` booking is swept through an **auto-return** instead, because only a `booking.returned` event releases its security deposit. That return records no damage and no late fee: nobody inspected the item, and the overdue time the fee would bill was created by the partner not processing the return — so the deposit goes back whole. See section 9.4.
- On money: **no service-payment refund** by default; the split is frozen on the **actual online service amount** (usually just the deposit — the `on_arrival` portion the customer never paid creates no obligation). The full security deposit is refunded separately and never changes the service settlement status. A journal is posted only after the dispute window. The tenant can configure whether affiliate commission applies to no-shows.
- `no_show` is a terminal state parallel to `completed` (the booking's time has passed, so it doesn't affect the exclusion constraint).
- **Two-way accountability**: the customer is notified when marked no-show and can dispute until the tenant-configured `holdingDays` deadline; the claim atomically locks settlement release. Partner can respond once, Tenant decides release/full refund/partial refund, and the tenant can see **each partner's cancellation/no-show rate**. Automatic penalties for a wrongful mark remain Phase 2.

### 8.6. Guest Checkout — Phase 1

- Customers can book **without creating a password**: enter full name + email + phone; the system creates a guest-type user (no password).
- Looking up/cancelling a booking uses the booking code + an **email OTP** (ZNS in Phase 2); a guest can "upgrade" to a full account by setting a password.
- The promotion's `first_booking_only` condition and the affiliate's self-referral check are matched against normalized email + phone (not just user_id).

### 8.7. Manual Booking (walk-in / phone booking) — Phase 2

- The partner (or tenant) creates a booking on the customer's behalf: enters the customer's info + slot, chooses the payment method — `online` (send the customer a payment link) or `offline` (already collected outside the system, marked paid).
- An offline booking still goes through the state machine and **still records commission** — the tenant sees full GMV, and partners have no incentive to use `availability_exceptions` to block a slot in order to dodge commission.
- API: `POST /partner/bookings` (manual), requires the `partner.bookings.write` permission; the creating actor is audit-logged.

---

## 9. Availability Engine per Booking Type

Shared port: `AvailabilityService.getAvailability(listingId, range) → Slot[] | DateRangeAvailability`. Each booking mode has its own strategy.

### 9.1. `hourly` — slot generation algorithm

Input: date D (in the **resource's** timezone), listing config, active bookings + holds for that day.

```
1. Get availability_rules for day_of_week(D) → open windows; apply availability_exceptions (closed/custom hours)
2. Generate a grid of start points using mode_config.hourly.granularity within each open window
3. For each start point s and duration d (flexible: minDuration..maxDuration; fixed package: exactly the selected package duration):
     occupied range = [s − buffer_before, s + d + buffer_after)
     exclude if it overlaps any booking (status ∈ confirmed, pending_*) or an active hold
     exclude if s < now + leadTimeMin (minimum lead time, in mode_config)
4. Return slots with prices: fixed packages use their absolute package price and ignore pricing
   rules; flexible bookings use per-unit pricing rules by priority. Promotions apply after subtotal.
```

Results are cached in Redis by `(listing, date, packageId | flexible)` for the booking/config portion only (invalidated on change); **hold state is never cached** — it's merged at read time, so a hold expiring naturally in Redis never leaves a "ghost" slot reported as busy.

Two cross-mode notes:

- **Busy checks are always by `resource_id`** (not listing): a different listing selling the same resource, or the same listing with multiple modes enabled — every booking blocks every other one on the same calendar.
- **A listing with both `hourly` + `daily` enabled** (studio, model): the customer picks how to book; a daily booking blocks every hourly slot for those days and vice versa — this falls out naturally since both are `tstzrange`s on the same resource.

### 9.2. `daily` — date-range based

- The unit is a **night/day**; the timeslot stores `[check-in time on day A, check-out time on day B)` so it can still use the same tstzrange exclusion constraint.
- The API returns a **monthly calendar**: each day is `available / booked / blocked / closed` + a per-day price (pricing_rules `date_range`, weekends...).
- Validation: flexible bookings use `minNights/maxNights`; fixed bookings require a package and validate the whole package stay from the selected start day.

### 9.3. `appointment` — service + staff (Phase 3)

Typical case: **photographers, makeup artists** — handled through 2 paths depending on scale:

- **Freelancers** — usable **starting from Phase 1** without needing the appointment mode: the freelancer registers as a **partner**, creates a listing under the "Photographer" listing type with `hourly` mode — since one person can only take one job at a time, the listing itself represents the freelancer's calendar, and the exclusion constraint applies directly as an exclusive resource. Attribute schema for the type: style, portfolio, equipment carried, willingness to shoot on location.
- **Multi-staff studios** (customer picks a service + picks a staff member or "any staff member") — the `appointment` mode below.

- Add a `staff` table (partner_id, user_id, display_name) and `staff_availability` (like availability_rules but per staff), `listing_staff` (which staff can perform which service, service duration).
- Available slots = intersection of (listing/room calendar) ∩ (calendar of the selected staff); "any staff member" = union across staff. Services **not tied to a room** (on-location shoots, makeup at the customer's home) → computed from staff calendar alone, plus a location field (on-site / at the customer's address / on location) and an optional travel fee.
- The exclusion constraint gains an additional `staff_id` dimension.

### 9.4. `inventory` — quantity-based rental: outfits, equipment (Phase 1)

- A listing has `stock_quantity` (10 outfits, 3 cameras...); a booking occupies `quantity` units over a time range (hourly or daily, configured on the listing).
- Stock check: `SUM(quantity)` of active bookings overlapping the requested range + the new quantity ≤ `stock_quantity` — done **atomically inside a transaction with an advisory lock per listing**, since the exclusion constraint doesn't apply to multi-unit resources (`inventory` mode is excluded from the constraint — see the WHERE clause in section 10).
- Current limitation: stock is tied to a **listing**, and sharing one stock pool across multiple listings isn't supported yet (different from a shared-calendar resource) — if the same batch of equipment needs to be sold via 2 listings, use a single listing + pricing rules for now; a shared inventory pool is in the backlog.
- The availability API returns the **remaining quantity** per time range (instead of free/busy slots).
- Buffer time is used for cleaning/inspecting the unit between two rentals of the same item.
- **Security deposit** — a required design companion to this mode, distinct from a payment deposit: a refundable amount returned after inspection; flow: item returned → inspected → deposit refunded or damage deducted (a separate ledger entry, **commission is never charged on the deposit** — it isn't revenue). Without a deposit, partners won't dare list expensive equipment on the marketplace.
- **Late returns**: a booking whose time has ended but the item hasn't been returned → flagged, blocking the next rental of that unit (avoiding a physical double-book) + a late fee added to `additional_charges`.

### 9.5. `class` — sessions with a seat count (Phase 3)

- A `class_sessions` table: listing_id, timeslot, capacity, booked_count, status. Generated from a recurring schedule (simple RRULE: weekly).
- Booking = decrementing a seat (`UPDATE ... SET booked_count = booked_count + n WHERE booked_count + n <= capacity` — atomic), no exclusion constraint needed.
- A booking references `class_session_id` instead of a free-form timeslot.

---

## 10. Double-booking Prevention

Two layers of protection:

**Layer 1 — Hold (user experience):** when the customer clicks "Book", a hold is written to Redis and checked for **time-range overlap** (a Lua script over a sorted set of currently-held intervals for the **resource**, buffer included) — not a hash-of-slot key, since two different ranges can still overlap (14:00–16:00 vs 15:00–17:00). TTL 600s, auto-released on expiry; other users see the slot grayed out immediately.

**Layer 2 — DB constraint (hard guarantee):**

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- blocked_period = timeslot EXPANDED by buffer_before/buffer_after
-- (buffer snapshotted at booking time — a later change to the listing's buffer doesn't affect old bookings);
-- the constraint must be on blocked_period; putting it on timeslot alone wouldn't protect the buffer
-- locked by RESOURCE (not listing): multiple listings selling the same resource
-- still share one calendar — booking through any of them can never overlap
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    resource_id    WITH =,
    blocked_period WITH &&
  )
  WHERE (status IN ('pending_payment','pending_approval','confirmed')
         AND booking_mode NOT IN ('inventory','class')); -- inventory/class use their own counting mechanism, not an exclusive calendar lock
```

Race scenario: 2 simultaneous requests both pass the application-level check → the second INSERT gets an `exclusion_violation` error → the API returns `409 SLOT_TAKEN`, the UI prompts choosing another slot. **Mandatory integration test**: N parallel requests for the same slot → exactly 1 succeeds.

Scope note: the exclusion constraint applies to **exclusive** resources (`hourly`, `daily`, `appointment`). The `inventory` mode uses an atomic stock check (section 9.4), and `class` mode uses an atomic seat count (section 9.5) — each type has its own race-safe mechanism, all enforced at the DB layer.

---

## 11. Payments: Plug-in Gateway, Deposits, Refunds

### 11.1. Port (hexagonal)

```ts
// modules/payments/domain/ports/payment-gateway.port.ts
export interface PaymentGatewayPort {
  readonly key: "sepay" | "payos" | "mock";

  createPayment(input: {
    amountVnd: bigint;
    orderCode: string;
    description: string;
    returnUrl: string;
    cancelUrl: string;
    expiresInSec: number;
  }): Promise<{
    destination:
      | { type: "redirect"; paymentUrl: string }
      | { type: "form_post"; actionUrl: string; fields: Record<string, string> };
    gatewayTxnId?: string;
    gatewayOrderRef?: string;
  }>;

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): {
    valid: boolean;
    event: "succeeded" | "failed" | "expired";
    gatewayTxnId: string;
    amountVnd: bigint;
  };

  refund(input: {
    gatewayTxnId: string;
    amountVnd: bigint;
    reason: string;
  }): Promise<{ supported: boolean; refundId?: string }>; // supported=false → refund becomes manual_required

  queryPaymentStatus(
    gatewayTxnId: string,
  ): // for the reconciliation job when a webhook is lost
  Promise<{
    status: "pending" | "succeeded" | "failed" | "expired";
    amountVnd: bigint;
  }>;
}
```

A registry picks the adapter based on the tenant's `tenant_gateway_configs` (credentials encrypted with AES-256-GCM, key from env/KMS). `MockGatewayAdapter` is used for dev/test/E2E: it has a fake "pay" page with Succeed/Fail buttons.

### 11.2. Standard Payment Flow (SePay, instant booking)

```
Customer → storefront: pick a slot → POST /bookings (creates a draft + hold)
API   → SePay adapter: sign checkout fields → form_post destination
Customer → SePay: POST checkout form → scan QR / bank transfer
SePay → API: IPN (X-Secret-Key) ──▶ verifyWebhook
API   : idempotency check (gateway_txn_id unique) → payment.succeeded
      → booking.transitionTo('confirmed')  // INSERT subject to the exclusion constraint
      → outbox: BookingConfirmed → email + ZNS to the customer & partner
Customer ← returnUrl: "Booking successful" page (polls status, never trusts returnUrl)
```

Principle: **only the webhook is the source of truth** for payment; returnUrl is only for UX navigation. Webhooks must be absolutely idempotent (unique key + status upsert). Reconciliation handles: stale `pending` payment via `queryPaymentStatus`; already-succeeded payment with missing Booking/Settlement projection; successful refund with a stale projection; and cancelled booking with a durable `refund_due_amount` but no refund row. A webhook/query result must **match `amountVnd` against the expected amount** (an underpayment can't be confirmed), and payment status is a one-way state machine — `succeeded` is terminal, and a later out-of-order `failed` event is ignored.

### 11.3. Refunds under the Cancellation Policy

```
refund = paid_amount × refundPercent(policy_snapshot, hoursBefore(timeslot.start − now))
```

- Gateway supports a refund API → call `refund()`, track the status.
- Not supported (most VN gateways) → refund goes `manual_required`: creates a task in the tenant dashboard, marked once transferred + with evidence.
- A refund on cancellation **before** `completed`: there's no commission journal yet to reverse — only the payment/refund is adjusted; the retained portion (if policy < 100%) is recorded as a `cancellation_fee` journal split per commission_snapshot. A refund **after** `completed` (dispute): recorded as a reversing `clawback` journal.
- Guest checkout has no payout info on file: send the customer a secure link (email OTP) to enter a receiving bank account; a `manual_required` refund has an **SLA + a reminder job** for the tenant, with evidence attached to the refund record.

---

## 12. Promotions & Discount Codes

### 12.1. Scope

- **Basic discount codes** — Phase 1 (deliberately minimal scope — promotions only matter once there's traffic): `percent`/`fixed` codes, an effective period, a usage limit, entered by the customer at checkout; `funded_by` defaults to `tenant`.
- **Advanced** — Phase 2: `funded_by = partner` (with opt-in), scoping by listing type/category/partner, per-customer limits, first-booking-only, **auto-applied campaigns** without a code, **partner-created codes** (`partner.promotions.manage` permission, toggleable by the tenant).

### 12.2. Tenant Admin Configuration Screen (Promotion Management)

- Create / edit / pause (`paused`) / end (`ended`) a program; parameters:
  - Discount type: `percent` (with a **max discount cap** `max_discount`) or `fixed` (a flat amount).
  - Scope: entire site / a specific listing (Phase 1); by listing type / category / partner _(Phase 2)_.
  - Conditions: minimum booking value; first-time customers only _(Phase 2)_.
  - Limits: total usage, effective period (starts*at → ends_at); per-customer usage *(Phase 2)\_.
  - Who bears the cost (`funded_by`): tenant or partner (default tenant). Choosing `partner` requires **partner confirmation (opt-in)** before the program takes effect on their listing — a tenant cannot unilaterally cut into a partner's revenue.
- Per-program stats: usage count, total amount discounted, revenue generated, conversion rate.
- **Cannot delete** a program that already has usage — only transition it to `ended` (preserving history/snapshots).

### 12.3. Customer Flow for Applying a Code at Checkout

```
Customer enters a code at checkout
  → POST /public/checkout/validate-promo { code, listingId, amount }
  → API checks: exists + active, not expired, correct scope (listing/category/partner),
              meets min_order_amount, total usage remaining (Phase 1); first_booking_only + per-customer (Phase 2)
  → returns { valid, discountAmount, finalAmount }
    (errors return a stable i18n code: PROMO_NOT_FOUND / PROMO_EXPIRED / PROMO_LIMIT_REACHED /
     PROMO_MIN_ORDER / PROMO_NOT_APPLICABLE / PROMO_FIRST_BOOKING_ONLY)

Booking created      → promo_redemption (reserved) + usage held atomically
Booking confirmed    → redemption → `applied` (usage locked in)
Booking expired / rejected / 100%-refund cancellation → redemption → `released` (usage returned)
```

Race-safe handling of the last available use (atomic, no locking needed):

```sql
UPDATE promotions SET redeemed_count = redeemed_count + 1
WHERE id = $1 AND status = 'active'
  AND (usage_limit_total IS NULL OR redeemed_count < usage_limit_total);
-- 0 rows affected = no uses left → return PROMO_LIMIT_REACHED
```

When a redemption transitions to `released`: **decrement `redeemed_count` in the same transaction** as the status change (reversed exactly once — idempotent). The per-customer limit is enforced atomically by counting the customer's `promo_redemptions` with `status ≠ released` inside a transaction locked by (promotion, customer) — two simultaneous tabs can't exceed the limit.

### 12.4. Interaction with Commission (important)

Principle: **the platform fee and affiliate commission are always computed on the amount the customer actually pays (`final_amount`)**. The partner's share depends on who bears the discount cost:

| funded_by | Partner receives                                                  | Discount deducted from        |
| --------- | ----------------------------------------------------------------- | ----------------------------- |
| `tenant`  | Based on the original price: `total_amount` − tenant commission   | The tenant's commission share |
| `partner` | Based on the discounted price: `final_amount` − tenant commission | The partner's revenue         |

Example: a **2,000,000 ₫** booking, a 5% discount code (**100,000 ₫**), tenant takes 15% from the partner, platform fee 2%, affiliate 5%:

| Line item                    | funded_by = partner                       | funded_by = tenant                                     |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| Customer pays (final_amount) | 1,900,000 ₫                               | 1,900,000 ₫                                            |
| Partner receives             | 1,900,000 − 285,000 = **1,615,000 ₫**     | 2,000,000 − 300,000 = **1,700,000 ₫**                  |
| Platform fee (2% × final)    | 38,000 ₫                                  | 38,000 ₫                                               |
| Affiliate (5% × final)       | 95,000 ₫                                  | 95,000 ₫                                               |
| Tenant net take              | 285,000 − 38,000 − 95,000 = **152,000 ₫** | 1,900,000 − 1,700,000 − 38,000 − 95,000 = **67,000 ₫** |

Validation when creating a `funded_by = tenant` promotion: warn (and block if it's certain to go negative) when the discount could push the tenant's share negative — approximately when `discount% + platform% + affiliate% > tenant%`.

### 12.5. Bookkeeping, Refunds & Testing

- Ledger entries at booking `completed` use `final_amount`; the discount is recorded in a separate `promo_discount` entry offset against whichever party bears the cost — enabling a "total amount discounted" report per program.
- Cancelling a booking: the refund is computed on the amount the customer **actually paid**; the redemption only goes to `released` on a full refund (early cancellation) — a partial refund keeps it `applied`.
- A booking's `promotion_snapshot` is immutable: editing/ending the program afterward has no effect on already-placed bookings.
- Mandatory tests: N parallel requests using the last available use → exactly `usage_limit_total` end up `applied`; the ledger balances under both `funded_by` types; `released` returns the usage; an expired/paused code is rejected.

---

## 13. Commissions & Double-entry Ledger

### 13.1. Principles

- A genuinely completed/no-show booking first enters `dispute_window`; entries are recorded only when
  its settlement is **released after the holding period**. A cancellation with a retained portion
  follows the same release guard as `kind=cancellation_fee`. An accepted dispute moves through
  `refund_pending`; only provider/manual `refund.completed` is refund truth. A legacy post-release
  refund uses a reversing `clawback`, which can make a balance negative and deduct it later.
- A settlement accepts one customer dispute. Full/partial refund is capped by
  `online_held_amount - refunded_amount`; partial outcomes store a cumulative total and the retained
  service amount waits through a new holding window before release.
- **Split invariant**: when computing commission_snapshot, every split (partner / platform / affiliate / tenant) must be **≥ 0** — important for a `fixed` rule on a small-priced booking (a fixed 200k fee on a 150k booking) and combinations of fixed + promo + affiliate; a violation → blocks booking creation, or floors the value + warns the tenant. Test this alongside the ledger test suite.
- Uses a **commission_snapshot** captured at booking time — changing the rule later doesn't affect old bookings.
- `ledger_entries` are immutable; a mistake is corrected with a reversing entry, never edited/deleted.
- A deposit + pay-on-arrival balance booking (`on_arrival`): commission is still computed on the full `final_amount` (only once the customer actually shows up — a no-show is recorded on `paid_amount`, section 8.5); the portion paid on-site is recorded as a "partner collected on our behalf" entry (the partner is already holding the cash) → reducing what the tenant owes the partner accordingly.
- A Partner-configured deposit percentage must be at least the effective Tenant commission
  percentage. Booking creation rechecks the exact VND amounts after promotion/rounding and rejects
  `deposit_amount < tenant_commission_gross`; security deposit never counts toward this coverage.
- **`additional_charges`** (extra charges, section 8.3): added to the commission base at `completed`, recorded as an `additional_charge` entry, handled like an `on_arrival` amount collected by the partner.
- Each business operation gets one `journal_id`; total debit = total credit.

### 13.2. Journal Entries for the Section 3.3 Example (2,000,000 ₫ booking, completed)

| #   | Account                                     | Debit     | Credit    |
| --- | ------------------------------------------- | --------- | --------- |
| 1   | Tenant — cash received via gateway (asset)  | 2,000,000 |           |
| 2   | Partner payable                             |           | 1,700,000 |
| 3   | Affiliate payable                           |           | 100,000   |
| 4   | Platform fee payable (tenant owes platform) |           | 40,000    |
| 5   | Tenant revenue (net commission revenue)     |           | 160,000   |

For a booking with a `funded_by = tenant` promotion: cash received is only 1,900,000 ₫ but partner payable is still 1,700,000 ₫ (based on the original price) — the journal balances thanks to a `promo_discount` line of 100,000 ₫ debited to the tenant's share (sections 12.4/12.5).

**House partner** variant (section 7.3): no partner payable/payout line — just 2 lines: Debit cash received via gateway / Credit platform fee payable (2% of GMV) + Credit tenant revenue (the remainder); affiliate, if any, is still deducted from the tenant's share.

When a tenant pays out a partner: Debit `Partner payable` / Credit `Tenant cash` — the partner's payable balance returns to 0. Monthly platform-fee reconciliation: total `Platform fee payable` per tenant → invoice.

### 13.3. Related Screens

- Partner: current balance, booking settlement/dispute deadline, ledger entry history, payout runs.
- Tenant: held-settlement register, net revenue, amounts payable to partners/affiliates, amount payable to the platform, create & mark payouts.
- Platform admin: fees collected per tenant, monthly reconciliation, CSV export.

---

## 14. 3-tier RBAC — Dynamic Roles

### 14.1. Model

- **Permission**: a fixed string seeded from code (not creatable via UI) — of the form `scope.resource.action`.
- **Role**: a named set of permissions, created dynamically via UI at the creator's own scope (a platform admin creates platform roles; a tenant admin creates tenant roles; a partner owner creates partner roles).
- **Assignment**: binds a user ↔ role within a scope (a specific tenant/partner). A user can have multiple roles across multiple scopes (e.g. being both a partner staff member for partner X and an affiliate for tenant Y).

### 14.2. Permission Catalog (excerpt, sufficient for Phase 1–2)

**Platform**: `platform.tenants.read/write`, `platform.plans.manage`, `platform.subscriptions.manage`, `platform.finance.read`, `platform.users.manage`, `platform.roles.manage`.

**Tenant**: `tenant.settings.manage`, `tenant.theme.manage`, `tenant.partners.approve`, `tenant.listings.read/write/publish`, `tenant.bookings.read/manage/cancel`, `tenant.commissions.manage`, `tenant.promotions.manage`, `tenant.finance.read`, `tenant.payouts.manage`, `tenant.affiliates.manage`, `tenant.members.manage`, `tenant.roles.manage`, `tenant.reports.read`.

**Partner**: `partner.listings.read/write/publish` (publish/hide their own posts — except a post `hidden_by = admin`), `partner.bookings.read/approve/cancel`, `partner.availability.manage`, `partner.promotions.manage` (Phase 2), `partner.finance.read`, `partner.members.manage`, `partner.roles.manage`.

### 14.3. Pre-seeded System Roles (`is_system = true`)

| Scope    | Role          | Permissions                                                           |
| -------- | ------------- | --------------------------------------------------------------------- |
| platform | Super Admin   | all `platform.*`                                                      |
| platform | Support       | `platform.tenants.read`, `platform.finance.read`                      |
| tenant   | Tenant Owner  | all `tenant.*`                                                        |
| tenant   | Manager       | all except `tenant.roles.manage`, `tenant.settings.manage`            |
| tenant   | Finance       | `tenant.finance.read`, `tenant.payouts.manage`, `tenant.reports.read` |
| partner  | Partner Owner | all `partner.*`                                                       |
| partner  | Staff         | `partner.bookings.read/approve`, `partner.availability.manage`        |

### 14.4. Enforcement

- NestJS: a `@RequirePermissions('tenant.listings.write')` decorator + `PermissionsGuard` — resolves the user's permissions within the request's scope (cached in Redis by user+scope, invalidated on role change).
- RR7 dashboard: the root loader returns `permissions[]` → hides/shows menu items, blocks routes via a guard in the loader (not just hiding UI).
- Every role/assignment change is audit-logged.

---

## 15. Affiliate System

### 15.1. Lifecycle

```
Affiliate signup (tenant approves) → creates referral_links (unique code)
→ customer clicks the link: records referral_clicks + sets a `aff_{tenantId}` cookie (30 days, last-click wins)
→ customer books: checkout reads the cookie or the customer enters a code manually → attaches affiliate_id to the booking (immutable)
→ booking confirmed: affiliate_commission (pending)
→ booking completed: commission → confirmed, recorded to the ledger
→ booking cancelled/refunded: commission → reversed
→ tenant payout: commission → paid
```

### 15.2. Rules

- Rate priority: `affiliates.custom_rate` > the applicable commission_rule rate > the tenant default.
- Basic fraud prevention: no commission when the customer refers themself (customer_id = the affiliate user, or matching email/phone), click/IP rate limiting, anomaly reporting for the tenant.
- **Self-dealing prevention**: no attribution is recorded when the affiliate user is a `partner_members` member of the partner who owns the listing — otherwise a partner could become their own affiliate to turn affiliate commission into a hidden discount deducted from the tenant's share.
- Link format: `https://storefront-domain/?ref=CODE` or `/listings/slug?ref=CODE`.

### 15.3. Affiliate Dashboard

Click count, recorded bookings, conversion rate, pending/confirmed/paid commission, payout history, a tool for generating links per listing.

---

## 16. Theming & Vertical-specific Templates

### 16.1. Templates

`tenants.vertical` selects the base template in `apps/storefront/app/templates/`:

| Template  | Industry                        | UI characteristics                                                                                                              |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `studio`  | Studio/room booking by hour/day | Grid-style listing page, **hourly slot picker** + **date-range calendar** when the listing has daily mode enabled, buffer shown |
| `rental`  | Day-based home rental (Phase 2) | Search by check-in/check-out dates, **date-range calendar picker**, a map                                                       |
| `classes` | Classes/sessions (Phase 3)      | Class schedule, remaining seats, multi-seat booking                                                                             |

A template is a set of route components + its own layout, sharing `packages/ui` and the same API. The root loader reads the tenant → renders the corresponding template (a route module resolved dynamically by vertical).

**Dynamic navigation by listing type**: the storefront menu is auto-generated from the tenant's active `listing_types` (e.g. StudioHub: Studio · Model Booking · Outfit Rental · Equipment Rental · Makeup). **The homepage shows every listing type** — each type gets a section (a featured list + a "view all" button); each type has its own listing page with **full filtering**: dynamic attributes (`filterable` in attribute_schema), price range, area, and **availability within a date range** (`available_from/to`). The booking UI adapts to whichever mode the customer picks — a listing with multiple modes shows a "By Hour / By Day" toggle (slot picker / calendar / quantity picker). For listing types with a **two-tier post structure** (Studio, Photographer): the detail page renders the `listing_group` (intro, album, amenities; plus reviews once enabled — section 24) + the list of child rooms/packages, and the customer picks a room/package before moving to the scheduling step. Search results include the `group_slug` to link back to the parent post page.

**Trust signals from Phase 1** (before ratings exist): an "identity verified" badge, number of completed bookings, "active since month X", the partner's average approval response time — all sourced from existing data at near-zero cost, and a prerequisite for a customer to dare pre-pay an unknown partner on a new site.

### 16.2. Theme Config (`tenants.theme_config`, jsonb)

```json
{
  "logoUrl": "...",
  "faviconUrl": "...",
  "colors": {
    "primary": "#0EA5E9",
    "accent": "#F97316",
    "background": "#FFFFFF"
  },
  "font": "inter",
  "hero": {
    "title": "Book a studio in 30 seconds",
    "subtitle": "...",
    "imageUrl": "..."
  },
  "carousel": ["https://cdn/.../slide-1.jpg", "https://cdn/.../slide-2.jpg"],
  "contact": { "phone": "...", "zalo": "...", "address": "..." },
  "seo": { "title": "...", "description": "..." },
  "socialLinks": { "facebook": "...", "instagram": "..." }
}
```

`logoUrl`, `faviconUrl`, `hero.imageUrl`, and every `carousel` entry are **uploaded images** — the tenant settings route (`apps/dashboard/app/routes/tenant/settings.tsx`) uses the GenericForm `file` field (favicon accepts `.ico`); the storefront renders `carousel` as a homepage slideshow (`apps/storefront/app/templates/studio/carousel.tsx`) above the hero, and hides it when empty. Rendered as CSS variables at SSR time (`<style>:root{--color-primary:...}</style>`) — no rebuild needed when a tenant changes its theme. The tenant dashboard groups brand, domains, operational rules, payments, and payouts in one permission-aware settings workspace; its theme editor has a live preview, and tenant-owned cancellation policies can be created, edited, selected as the fallback default, or deleted when unused.

**Storefront SEO**: each domain auto-generates a `sitemap.xml` (homepage + published `listing_groups` + published standalone listings) and `robots.txt`; meta title/description + Open Graph come from `theme_config.seo` and listing data; RR7's SSR ensures crawlers can read the content.

---

## 17. Notifications (Email + Zalo ZNS)

`NotificationPort` + an `EmailAdapter` (SMTP/Resend; mailpit for dev) and a `ZnsAdapter` (Zalo ZNS — templates pre-registered with Zalo, sent by the customer's phone number).

| Event (domain event)             | Recipient                                                                          | Channel              |
| -------------------------------- | ---------------------------------------------------------------------------------- | -------------------- |
| BookingCreated (pending_payment) | Customer                                                                           | Email (payment link) |
| BookingPendingApproval           | Partner                                                                            | Email + ZNS          |
| BookingConfirmed                 | Customer + Partner                                                                 | Email + ZNS          |
| BookingReminder (T−24h, job)     | Customer                                                                           | ZNS (email fallback) |
| BookingCancelled / Refunded      | Customer + Partner                                                                 | Email                |
| BalancePaymentDue                | Customer                                                                           | Email + ZNS          |
| PayoutPaid                       | Partner / Affiliate                                                                | Email                |
| SubscriptionExpiring (T−7d)      | Tenant admin + **Platform admin** (reminder to collect payment — manual invoicing) | Email                |

Every notification goes through the outbox → BullMQ (retry + dead-letter). Email templates are per-tenant (logo, colors), bilingual vi/en based on `users.locale`. A `notification_logs` table tracks what was sent.

Email HTML is rendered server-side from reusable React Email components, with a plain-text fallback
and CID-hosted status assets for mail-client compatibility. Registration/password-reset and guest
booking OTPs use the same tenant-aware visual shell; platform-host auth falls back to BookingOS.
`partner.applied` acknowledges receipt, while `partner.approved` sends separate account-ready and
agreement-version messages. Agreement emails link to the recorded versions and terms; they do not
invent or attach a legal PDF.

---

## 18. i18n, Timezone, Currency Conventions

- **Money**: VND only, stored as `bigint` in đồng (no decimals). Display formatting via `Intl.NumberFormat('vi-VN')`. A shared helper lives in `shared/money`; using float `number` for money is forbidden. **Rounding**: every % calculation rounds half-up to the đồng; when splitting an amount across multiple parties (partner/platform/affiliate), any leftover remainder is rolled into the tenant's share so the sum of all splits always exactly matches `final_amount` (the ledger balances exactly).
- **Time**: the DB stores `timestamptz` (UTC). Every display/input is converted using `resource.timezone` (falling back to the tenant's, default `Asia/Ho_Chi_Minh`). Opening hours are stored as local time + timezone so they stay correct across DST changes (Vietnam has no DST, but the design accounts for it anyway).
- **i18n**: key-based, resources in `vi.json`/`en.json` under `packages/shared`; the storefront follows `tenants.default_locale` + a switcher; the dashboard follows `users.locale`; email/ZNS follow the recipient's locale. Tenant-entered content (listing descriptions...) is single-language in Phase 1.

---

## 19. API Design

- REST, prefix `/api/v1`, JSON; request/response schemas defined with zod in `packages/shared` (imported directly by the FE — type-safe end to end). OpenAPI is generated from the contracts.
- Standardized errors: `{ error: { code: "SLOT_TAKEN", message, details? } }` — a stable code so the FE can localize it.
- Cursor-based pagination; an idempotency-key header for POST requests that create a booking/payment.

### Main Endpoints (excerpt)

```
# Public (storefront, tenant resolved from Host)
GET  /public/listing-types                               # the tenant's listing-type menu
GET  /public/groups?type=&category=&q=&attr.*=           # posts listed by type (the main list page)
GET  /public/groups/:slug                                # post page: the group + its child rooms/packages
GET  /public/listings?type=&category=&mode=&q=&attr.*=&available_from=&available_to=   # filter by type + dynamic attributes + availability
GET  /public/listings/:slug
GET  /public/listings/:id/availability?from=&to=        # slots or a calendar
POST /public/checkout/validate-promo                     # validate a promo code, returns {discountAmount, finalAmount}
POST /public/bookings                                    # creates a draft + hold (idempotent, with promoCode if any)
POST /public/bookings/:id/checkout                       # creates/reuses a payment, returns checkout destination
GET  /public/bookings/:code                              # look up by code + email OTP (guest)
GET  /public/my-bookings                                 # a logged-in customer viewing their own bookings
POST /public/bookings/:id/reschedule                     # reschedule (Phase 2)

# Webhook
POST /webhooks/:gateway                                  # raw body, provider auth/signature verified

# Auth
POST /auth/register | /auth/login | /auth/refresh | /auth/logout

# Tenant admin
CRUD /tenant/listing-types                               # dynamic listing types + attribute schema
CRUD /tenant/listing-groups /tenant/listings /tenant/partners /tenant/categories /tenant/policies
POST /tenant/listing-groups/:id/approve|hide|unhide      # approve/hide (hidden_by=admin locks out the partner)
GET  /tenant/bookings?status=&partner=&from=&to=
POST /tenant/bookings/:id/cancel
CRUD /tenant/commission-rules /tenant/roles /tenant/members
CRUD /tenant/promotions   GET /tenant/promotions/:id/stats   # promotions + usage stats
GET  /tenant/finance/summary /tenant/finance/ledger
POST /tenant/payouts  PATCH /tenant/payouts/:id/mark-paid
PUT  /tenant/theme    CRUD /tenant/domains

# Partner
CRUD /partner/resources                                  # calendar units + blocking a resource's calendar
CRUD /partner/listing-groups /partner/listings /partner/availability
GET  /partner/bookings   POST /partner/bookings/:id/approve|reject|no-show
POST /partner/bookings                                   # manual walk-in booking (Phase 2)
GET  /partner/finance/balance

# Platform admin
CRUD /admin/tenants /admin/plans /admin/subscriptions
GET  /admin/finance/platform-fees?month=

# Affiliate (Phase 2)
GET  /affiliate/links  POST /affiliate/links
GET  /affiliate/stats  GET /affiliate/commissions
```

---

## 20. Security

| Item                        | Measure                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Passwords                   | Argon2id; login rate limiting; temporary lockout after N failed attempts                                                                         |
| Sessions                    | httpOnly session cookie + SameSite=Lax, refresh rotation; cookie scoped to the dashboard domain; storefront guests use a guest session for holds |
| CSRF                        | Token for every dashboard form (RR7 action)                                                                                                      |
| Tenant isolation            | RLS FORCE (section 6) + automated isolation tests in CI                                                                                          |
| Webhooks                    | Signature verification per gateway, raw body, idempotency, IP allowlist where the gateway supports it                                            |
| Payment gateway credentials | AES-256-GCM at the app layer, key kept outside the DB; never returned by the API                                                                 |
| Authorization               | PermissionsGuard on every non-public endpoint; deny-by-default                                                                                   |
| Audit                       | audit_logs for roles, commissions, promotions, hiding/showing posts, payouts, refunds, theme/domain                                              |
| Input                       | zod validates every request; image uploads via presigned URL, restricted by type/size                                                            |
| Other                       | Helmet headers, CORS restricted to the tenant's domain list, rate limiting by IP + user                                                          |

Additional auth flows (Phase 1): **email verification** at signup; **password reset** (one-time token, expires in 30 minutes); **email OTP** for guest booking lookup (section 8.6). Google/Zalo login: backlog (section 24).

**Auth on a tenant's custom domain**: the RR7 storefront acts as a **BFF** — the session cookie is set on the tenant's own domain, and every API call happens **server-side** from RR7 (with internal auth between the BFF and the API); this entirely avoids cross-site/SameSite cookie issues when the storefront and API are on different domains. CSRF tokens apply to storefront actions too (checkout, cancel, entering a promo code), not just the dashboard.

---

## 21. Detailed Roadmap by Phase

### Phase 0 — Foundation

1. Scaffold the monorepo (pnpm + Turborepo), docker-compose (postgres/redis/mailpit/minio), CI (lint/typecheck/test).
2. Initialize `packages/shared`, `packages/ui`.
3. NestJS skeleton + hexagonal conventions; first-pass Prisma schema + migration; RLS setup + tenant-context middleware + Prisma extension; **first RLS isolation test**.
4. Auth (register/login/refresh); seed the permission catalog + system roles; PermissionsGuard.
5. Outbox + BullMQ relay; shared money/time helpers.

### Phase 1 — Studio Vertical MVP

1. Tenancy: tenant CRUD, domain mapping, plans + manual subscription, expiry/limit enforcement (Phase 1: platform admin creates tenants manually; self-serve signup in Phase 3).
2. Catalog: partners (signup + tenant approval, individual/company, **house partner**, identity verification for people-booking types), **dynamic listing types** (tenant-defined types + attribute schema, auto-generated menu/filters), **two-tier posts** (`listing_groups` containing multiple rooms/packages), listings with **multiple modes enabled** (`hourly` + `daily`) and Listing Type pricing selection (`flexible_duration` or mandatory `fixed_packages`), calendar-sharing resources, post moderation, pricing rules for flexible pricing, image uploads, storefront trust signals.
3. Scheduling: availability rules/exceptions, slot-generation engine + calendar, caching.
4. Booking: the full state machine (including no-show + **request-to-book/approval** — already part of the state machine), Redis holds, exclusion constraint, cancellation policies, guest checkout + OTP lookup, a date-range calendar for daily mode, **`inventory` mode** (outfit/equipment rental by quantity + security deposit + late-return handling — enough to launch StudioHub with 4 of its 5 listing types).
5. Payments: the port + `sepay` + `mock` (legacy PayOS adapter retained); instant + deposit; idempotent IPN; refunds (manual when the provider has no refund API).
6. Finance: commission rules + snapshots, double-entry ledger, journal entries at completion, balances, manual payouts.
7. **Basic** promotions: `percent`/`fixed` codes + an effective period + a usage limit, validation + redemption at checkout (reserved/applied/released); the advanced parts (partner funded_by, campaigns, per-customer) → Phase 2.
8. Dashboard: the admin area (tenants/plans + a **tenant health board**: GMV, published listings, time to first booking, webhook failures, overdue payouts + a queue of subscriptions/trials about to expire), the tenant area (listings/bookings/finance/promotions/theme, listing approval + partner cancellation rates), the partner area (listings, a **combined calendar** — a master calendar showing every booking across every resource by day/week, filterable by listing type, with quick calendar blocking, bookings, revenue).
9. Storefront: the `studio` template + CSS-variable theming, search/filter, slot picker, checkout (with a promo-code field), booking lookup; vi/en.
10. Notifications: full email coverage of every event; a reminder job.
11. Demo seed data + a Playwright E2E journey for book–complete–cancel (including one case using a discount code).

### Phase 2 — Marketplace Depth

Full affiliate system (links, cookie attribution, commission lifecycle, dashboard) · advanced promotions (auto-applied campaigns without a code, partner-created codes, off-peak time-window discounts) · a 3-tier role-builder UI · MoMo + VNPay adapters · reschedule · manual walk-in bookings · in-app customer↔partner chat · automatic penalties for a partner's wrongful cancellation/no-show · Zalo ZNS · an advanced payout screen + platform-fee reconciliation · the `rental` template.

### Phase 3 — New Verticals & Automation

`class` mode (sessions, capacity) · `appointment` mode (staff, delivery scheduling) · automatic recurring subscription billing via a gateway + dunning · tenant self-serve signup + trial · a public API + API keys for large tenants · advanced reporting.

---

## 22. Testing Strategy

| Layer         | Tooling                          | Focus                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (domain) | Vitest                           | State machine (every valid/invalid transition), commission calculation & **the ledger always balances**, slot generation (buffer, exceptions, lead time), refund calculation per policy                                                                                                                                                                                                         |
| Integration   | Vitest + Testcontainers Postgres | **RLS: tenant A can't read tenant B**; **booking race: N parallel requests → exactly 1 succeeds**; idempotent webhooks (5 duplicate deliveries → 1 payment); **promo race**: N requests fighting over the last use → exactly usage_limit end up applied + released correctly returns the usage; **inventory race** (N requests fighting over the last unit → never exceeds stock); outbox relay |
| Contract      | zod contracts                    | FE/BE share the same schema; OpenAPI snapshot                                                                                                                                                                                                                                                                                                                                                   |
| E2E           | Playwright + a mock gateway      | Customer: search → hold a slot → pay (including one **discount code** case) → receive an email (mailpit) → cancel → refund; **equipment rental**: book a quantity → security deposit → return the item → deposit refunded; Tenant: create a listing → approve → appears on the storefront; Partner: approve a request-to-book                                                                   |
| Real gateway  | SePay Sandbox                   | One full end-to-end payment + IPN + reconciliation flow before release                                                                                                                                                                                                                                                                                                                           |

Definition of done per phase: `pnpm turbo lint typecheck test` green + E2E green + a working demo via `docker compose up` with seed data.

---

## 23. Risks & Open Decisions

| #   | Issue                                                                                   | Recommendation / Status                                                                                                                      |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Limited refund APIs among Vietnamese gateways                                           | SePay currently uses the existing `manual_required` refund flow; re-check provider capability before enabling automated refunds               |
| 2   | Money lands in the tenant's account (not the platform's) → platform fee collected later | Reconciliation + monthly invoicing; consider a collect-on-behalf-of model once legally viable                                                |
| 3   | Custom domain SSL                                                                       | Use a reverse proxy that self-issues certs (Caddy/Traefik) or a hosting platform that supports it (decide when choosing hosting)             |
| 4   | Zalo ZNS requires an OA + pre-approved templates                                        | Start the registration process early in Phase 1, integrate in Phase 2                                                                        |
| 5   | The `platform% + affiliate% ≤ tenant%` constraint                                       | Validate in both the UI + the domain layer when saving a commission rule                                                                     |
| 6   | Production hosting/deployment                                                           | Not yet decided (VPS + Docker, or a PaaS). Doesn't block Phase 0–1 (docker-compose for dev)                                                  |
| 7   | Vietnamese tax / e-invoicing                                                            | Out of scope for the MVP; the ledger already has enough data to generate reports later                                                       |
| 8   | Personal data protection (Decree 13/2023/NĐ-CP)                                         | A privacy policy + consent at data collection; encryption of sensitive PII; a data-deletion process on request; customer data-access logging |
| 9   | Customer–partner disputes (service not as described...)                                 | Dedicated custody dispute state is implemented; Tenant still adjudicates manually and performs SePay refunds by bank transfer with evidence |

---

## 24. Out of Scope — Future Backlog

Items that have **already been considered** but deliberately deferred (not overlooked); the current architecture doesn't block adding them later:

- **Reviews & ratings**: customers review after a booking is `completed` (already supported by the state machine); partners can reply + filter by responded/not responded. Two independent tables `reviews` (booking_id unique, rating, content) + `review_replies`; `rating_avg`/`review_count` are denormalized onto the listing/group via the outbox.
- **Chat with admin**: two channels, customer↔admin and partner↔admin (the customer↔partner channel is already on the Phase 2 roadmap) — one shared `conversations` module (type, booking_id nullable, status open/resolved) + `messages` (read_at); a **Partner Hub** (a queue of partner support requests) is simply the partner↔admin conversations with a status, needing no separate module. The contact-info ban (section 7.3) also applies to chat content before a booking is confirmed.
- **In-app notification center** (read/unread): add an `in-app` adapter to the existing `NotificationPort` — writes to a `notifications (user_id, type, title, body, link, read_at)` table; every event in section 17 automatically gets an in-app version, with no logic duplicated.
- **Wishlist**: a `wishlists (customer_id, group_id | listing_id — one or the other, covering standalone listings too)` table + a few endpoints — entirely independent.
- **Community/Feed + content CMS + Reports**: `feed_posts` (user posts, hashtags, media), `content_posts` (admin: news/solutions/support/static policy pages), a polymorphic `reports` table (target_type: feed/review/listing) shared across every content type — this whole cluster has no foreign key into bookings/money, so it can be built last without blocking anything.
- **Traffic analytics** on the dashboard: not built in-house — plug Plausible/Umami into the storefront, and have the dashboard read metrics via its API.
- **Similar posts** (same type + category + area, sorted by rating) and **partner-suggested new amenities** for admin approval into master data.
- **Waitlist** when a slot/date is fully booked — notify when it frees up.
- **Recurring bookings** (e.g. renting a studio every Tuesday).
- **Shared inventory pool** — multiple listings selling from one shared batch of equipment (section 9.4 currently limits stock to a single listing).
- **Full map/location-based search** — the Phase 1 storefront already shows the 10 nearest published offerings for the selected listing type using the customer's opt-in browser location; an interactive map, radius controls and rental-template map search remain future work.
- **Multi-listing cart / combos** in a single checkout (studio + photographer + makeup in the same time slot — a real need in the studio industry; consider pulling forward into Phase 3) and **add-on services** (extra lighting, extra hours) attached to a primary listing.
- **Impersonation** — a super admin "logging in as a tenant" for support purposes (with auditing).
- **Automated dispute SLA/escalation** beyond the implemented claim → Partner response → Tenant
  release/full/partial-refund workflow.
- **VAT invoices / e-invoices** for business customers.
- **Google/Zalo login** (social login).
- **Mobile app** — the API contracts are already reusable for this.
- **Multi-currency / multi-country** — currently VND only (section 18).
