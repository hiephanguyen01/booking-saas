# CLAUDE.md — Bookify: Booking SaaS + Marketplace (Turborepo + NestJS + React Router 7)

This file documents the **conventions and full-stack patterns** for the codebase. The authoritative
**product/design spec is [`phases/core.md`](./phases/core.md)** (English) / `phases/core.vi.md` (Vietnamese),
and the **ticket-by-ticket plan is [`docs/superpowers/plans/booking-saas-tasks/`](./docs/superpowers/plans/booking-saas-tasks/)**.
Read this file for _how we build_; read `phases/core.md` for _what we're building_. When they disagree on
product behaviour, `phases/core.md` wins; when they disagree on code structure, this file wins.

> All AI agents must read this file in full — [AGENTS.md](./AGENTS.md) exists only to redirect
> non-Claude tools (Codex, Cursor, Gemini CLI, …) here. The skill invocations in Section 1 apply
> only to agents that have those skills; every other section applies to every agent verbatim.

---

## Table of Contents

1. [Claude Skills & Tools to Use](#1-claude-skills--tools-to-use)
2. [Project Overview](#2-project-overview) · [2.1 Phase 0 Implementation Map](#21-phase-0--what-is-implemented-read-this-first)
3. [Stack Decisions](#3-stack-decisions)
4. [Monorepo Setup & Commands](#4-monorepo-setup--commands)
5. [Backend Architecture (NestJS + Hexagonal)](#5-backend-architecture-nestjs--hexagonal)
6. [Frontend Architecture (React Router 7 SSR)](#6-frontend-architecture-react-router-7-ssr)
7. [Auth Flow](#7-auth-flow)
8. [Shared Packages](#8-shared-packages)
9. [User Stories & Roadmap](#9-user-stories--roadmap)
10. [Coding Conventions](#10-coding-conventions)
11. [Environment Variables](#11-environment-variables)
12. [Running, Testing, and Building](#12-running-testing-and-building)
13. [Common Patterns (Cookbook)](#13-common-patterns-cookbook)

---

## 1. Claude Skills & Tools to Use

When working on this project, Claude Code **must** invoke the appropriate skills listed below.
Each skill provides specialized knowledge and patterns — never guess at conventions when a skill covers the topic.

**All project skills are vendored in `.claude/skills/` and checked into this repo** — every
clone has them available without any per-machine installation. (`/security-review`, `/review`,
`/run`, `/verify`, and `/simplify` are Claude Code built-ins and need no install.)

### Backend Skills

| Task                                                               | Skill to Invoke           |
| ------------------------------------------------------------------ | ------------------------- |
| Any NestJS module, guard, decorator, interceptor, pipe             | `/nestjs`                 |
| Architecture decisions (new module, layer boundaries, trade-offs)  | `/designing-architecture` |
| REST API design (endpoints, status codes, request/response shapes) | `/designing-apis`         |
| Writing or reviewing tests (unit, integration, e2e)                | `/designing-tests`        |
| Security review (auth, input validation, JWT, RBAC)                | `/security-review`        |
| TypeScript documentation, JSDoc, ADRs                              | `/typescript-docs`        |

### Frontend Skills

| Task                                                       | Skill to Invoke                |
| ---------------------------------------------------------- | ------------------------------ |
| Any React component, hooks, Server Components, use()       | `/react-patterns`              |
| Adding or configuring shadcn/ui components                 | `/shadcn`                      |
| Tailwind CSS layouts, responsive design, utilities         | `/tailwind-css-patterns`       |
| Design direction — landing pages, redesigns, visual polish | `/design-taste-frontend`       |
| UI/UX review — accessibility, contrast, spacing, hierarchy | `/web-design-guidelines`       |
| React Router 7 / Vite / Vercel deployment patterns         | `/vercel-react-best-practices` |
| Component composition, render patterns                     | `/vercel-composition-patterns` |
| Performance (bundle size, Core Web Vitals, lazy loading)   | `/optimizing-performance`      |

### General / Cross-cutting Skills

| Task                                                | Skill to Invoke       |
| --------------------------------------------------- | --------------------- |
| Git branching, commits, PRs, conflict resolution    | `/managing-git`       |
| Parallel subagent execution for independent tasks   | `/parallel-execution` |
| Run the app locally and verify a feature works      | `/run` then `/verify` |
| Post-implementation code cleanup and simplification | `/simplify`           |
| PR review (quality, correctness, consistency)       | `/review`             |

### When to Use Skills (Rules)

- **Before writing any NestJS code** → invoke `/nestjs` for module structure.
- **Before adding any UI component** → invoke `/shadcn` to check if the component already exists in the registry before building custom. Shared components are added to `packages/ui`, never to an individual app.
- **After any frontend change** → invoke `/web-design-guidelines` if the change touches visual layout or user-facing text.
- **Before merging** → invoke `/security-review` for any auth, RBAC, or input-handling change.
- **When asked to "make it look nice"** → invoke `/design-taste-frontend` for direction, then
  `/tailwind-css-patterns` for implementation + `/web-design-guidelines` for the final check.
- **For any performance complaint** → invoke `/optimizing-performance` before guessing.

---

## 2. Project Overview

**Bookify** is a multi-tenant **Booking-Platform-as-a-Service + marketplace** for the Vietnamese
market (full spec: `phases/core.md`). Each business customer (**tenant**) gets its own branded booking
site; **partners** list bookable resources inside a tenant; **customers** book & pay on the storefront;
the **platform** earns a subscription fee + a per-booking %; **affiliates** refer customers for a cut.
Money moves through a double-entry **ledger**; tenant isolation is enforced by **Postgres RLS**;
double-booking is prevented by a `tstzrange` GiST **exclusion constraint**; access control is
**3-tier dynamic RBAC** (platform / tenant / partner).

The stack: NestJS backend (**Hexagonal** / ports & adapters) · two React Router 7 SSR frontends
(storefront + dashboard) · PostgreSQL via Prisma · Redis + BullMQ · Argon2id + session/refresh auth ·
Helmet + CORS allowlist + throttling · Pino logging · Terminus health checks.

### Current Implementation Status

**Phase 0 (Foundation) is fully implemented and verified.** See
[§2.1 Phase 0 Implementation Map](#21-phase-0--what-is-implemented-read-this-first) for exactly what
exists and where. Phases 1–3 are **spec + tickets only** — implement them per
`docs/superpowers/plans/booking-saas-tasks/phase-{1,2,3}-*/`, following the patterns in this file.

| Phase                                | Status                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- |
| **Phase 0 — Foundation**             | **Implemented** — monorepo, RLS multi-tenancy, auth, RBAC guard, outbox, CI |
| Phase 1 — Studio Vertical MVP        | Spec + tickets only (`phase-1-studio-mvp/`)                                 |
| Phase 2 — Marketplace Depth          | Spec + tickets only (`phase-2-marketplace-depth/`)                          |
| Phase 3 — New Verticals & Automation | Spec + tickets only (`phase-3-new-verticals/`)                              |

> The old "template" modules (Items CRUD, Organizations, JWT-only auth, single `apps/frontend`) have
> been **removed/replaced** by the Phase 0 work. Ignore any lingering references to them elsewhere.

---

## 2.1 Phase 0 — What Is Implemented (read this first)

Everything below exists, compiles, and is verified (`pnpm turbo type-check lint build test`, RLS
checks, seed). Copy these patterns — do not reinvent them.

### Apps & packages (actual, current)

```
apps/api            NestJS API (PORT env, default 3001), hexagonal, RLS-aware
apps/storefront     React Router 7 SSR — customer-facing (port 3000)
apps/dashboard      React Router 7 SSR — /admin /tenant /partner /affiliate (port 3002)
packages/contracts  @booking/contracts — zod schemas (src/contracts/*.ts) + inferred types + i18n (vi/en). FE+BE contract.
packages/ui         @booking/ui — shadcn components, GenericForm, ImageUpload, Tailwind preset, theme CSS
packages/api-client @booking/api-client — typed server-side HTTP client + interceptor + error types (loaders/actions)
packages/auth       @booking/auth — shared token + permission helpers
packages/config     @booking/config — shared tsconfig / eslint / prettier / tailwind / vite presets
```

> **Naming note:** contracts moved from `@booking/shared` → **`@booking/contracts`**. `packages/shared`
> is a deprecated leftover (no `package.json`/`src`). Older sections below may still say `@booking/shared`
> or `packages/shared/src/contracts/*` — read those as `@booking/contracts` / `packages/contracts/src/contracts/*`.

### API bounded contexts & shared concerns (`apps/api/src`)

```
modules/  (12 bounded contexts, each = domain/ · application/ · infrastructure/)
  identity-access   Argon2id auth, rotating sessions, PermissionsGuard + resolver
  tenancy           tenants, custom domains, plans, subscriptions, theme, settings/flags
  partner           partner applications, approval, identity verification, payout info
  catalog           listing-types (dynamic attribute schema) + public catalog search
  listing           listings, groups, resources, pricing rules, moderation workflow
  scheduling        availability rules/exceptions, slot generation
  booking           booking lifecycle, holds, cancellation, inventory, partner calendar
  payments          checkout, gateway configs, webhooks, refunds
  promotions        promo codes, partner promotions, auto-campaigns
  finance           commission rules, double-entry ledger, payouts
  affiliate         referral links, last-click attribution, commissions
  notification      email (+ Zalo ZNS) dispatch + templates
shared/   (11 cross-cutting concerns — no business logic)
  tenant-context    AsyncLocalStorage + TenantDbService.forTenant()
  prisma            PrismaService (RLS app_user) + PrismaAdminService (BYPASSRLS)
  redis             shared ioredis client (holds, BullMQ, permissions cache)
  outbox            transactional outbox + BullMQ relay
  audit             AUDIT_WRITER port — the single audit_logs write path
  storage           S3/MinIO presign adapter + POST /uploads/presign
  validation        Zod validation pipe(s)
  openapi           Swagger decorators/helpers
  health            /health, /health/ready (Terminus)
  money             VND bigint format/parse
  time              UTC timezone helpers
```

### Backend building blocks (where things live)

> Cross-cutting infrastructure lives under `apps/api/src/shared/*`; bounded contexts
> under `apps/api/src/modules/*` (each with `domain/ · application/ · infrastructure/`).
> There is no `src/infrastructure/` or `src/common/` folder.

| Concern                    | Location                                                             | Notes                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Tenant context**         | `src/shared/tenant-context/`                                         | `TenantDbService.forTenant(tenantId, fn)`, AsyncLocalStorage, `TenantContextService`                                       |
| **DB pool(s)**             | `src/shared/prisma/`                                                 | `PrismaService` (RLS-bound `app_user`, `APP_DATABASE_URL`); admin/BYPASSRLS access where needed (`DATABASE_URL`)          |
| **Redis**                  | `src/shared/redis/`                                                  | shared `ioredis` client (holds, BullMQ, permissions cache)                                                                 |
| **Object storage (uploads)** | `src/shared/storage/`                                              | `S3StorageService` + `POST /uploads/presign` (`@AuthenticatedOnly`); presigned PUT direct to MinIO/S3, image-only + `.ico` |
| **Auth (identity-access)** | `src/modules/identity-access/`                                       | Argon2id, `Session` rotation, 5-attempt lockout, register/login/refresh/logout                                             |
| **Permissions**            | `src/modules/identity-access/infrastructure/http/{guards/permissions.guard.ts,decorators/require-permissions.decorator.ts}` + `services/permission-resolver.service.ts` | `@RequirePermissions(...)`, Redis-cached, **deny-by-default** |
| **Outbox**                 | `src/shared/outbox/`                                                 | `OutboxService.emit(tx, event)` + BullMQ relay (`forTenant` per event, retry/dead-letter)                                  |
| **Example module to copy** | `src/modules/tenancy/`, `src/modules/partner/`                       | canonical hexagonal modules (`domain/ · application/ · infrastructure/`)                                                    |
| **Health**                 | `src/shared/health/`                                                 | `GET /health` (liveness), `GET /health/ready` (DB+Redis)                                                                   |
| **RLS migration**          | `prisma/migrations/*_rls_*/`                                         | hand-written SQL: FORCE RLS + policy per tenant table, `app_user`/`app_admin` roles                                        |

### The five load-bearing rules (violating these breaks tenancy/security)

1. **All tenant data goes through `forTenant()`.** Repositories receive the `tx` handle, never the raw
   client. `forTenant` sets the `app.tenant_id` GUC on the transaction so RLS applies. One `forTenant`
   wraps one whole business operation (never per-query, never nested). See [§5](#5-backend-architecture-nestjs--hexagonal).
2. **Every new tenant-scoped table needs `tenant_id uuid NOT NULL` + a hand-written RLS migration**
   (FORCE RLS + `tenant_isolation` policy). `db:check-rls` fails CI if you forget. See the cookbook.
3. **Every protected endpoint declares `@RequirePermissions('scope.resource.action')`.** The global
   guard is deny-by-default: a non-`@Public()` endpoint with no permission fails closed.
4. **Money is `bigint` VND, percents are integer basis points; time is `timestamptz` UTC.** Use the
   `@booking/shared` money/time helpers — never a JS float for money.
5. **Modules never call each other's services.** They communicate via the **outbox** (write an event in
   the same `forTenant` tx; register a handler). See the cookbook.

---

## 3. Stack Decisions

| Concern           | Choice                                               | Rationale                                                                |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Monorepo          | Turborepo                                            | Fast incremental builds, task graph, caching                             |
| Backend framework | NestJS                                               | Strong DI container, decorators, modular, TS-first                       |
| Backend arch      | Hexagonal (Ports & Adapters)                         | Domain logic is framework-agnostic, testable in isolation                |
| ORM               | Prisma                                               | Type-safe queries, migrations, schema-as-source-of-truth                 |
| Database          | PostgreSQL 16 (+ `btree_gist`, `citext`, `pgcrypto`) | RLS-based tenant isolation; exclusion constraint for double-booking      |
| Multi-tenancy     | Postgres RLS + `forTenant()`                         | `app.tenant_id` GUC per transaction; dual pools (`app_user`/`app_admin`) |
| Cache / Queue     | Redis 7 + BullMQ                                     | Holds, outbox relay, permissions cache                                   |
| Frontend          | React Router 7 (framework mode)                      | Two SSR apps: storefront + dashboard (BFF pattern)                       |
| Auth              | Argon2id + session/refresh (rotating)                | Per-account lockout; refresh tokens stored hashed in `Session`           |
| AuthZ             | 3-tier dynamic RBAC                                  | `@RequirePermissions` + `PermissionsGuard`, deny-by-default              |
| Money / Time      | `bigint` VND / `timestamptz` UTC                     | Never floats for money; helpers in `@booking/shared`                     |
| UI primitives     | shadcn/ui + Tailwind CSS                             | Accessible, unstyled-first, copy-own-code model                          |
| Shared contracts  | `@booking/shared`                                    | zod schemas + types + money/time/i18n, framework-free                    |
| Shared UI         | `@booking/ui`                                        | One component library + Tailwind theme for every frontend                |
| Package manager   | pnpm                                                 | Fast, disk-efficient, strict dependency resolution                       |

---

## 4. Monorepo Setup & Commands

### Structure

```
booking-saas/
├── apps/
│   ├── api/              # NestJS + Prisma (PORT env, default 3001) — hexagonal, RLS-aware
│   ├── storefront/       # React Router 7 SSR — customer-facing, tenant from Host (port 3000)
│   └── dashboard/        # React Router 7 SSR — /admin /tenant /partner /affiliate (port 3002)
├── packages/
│   ├── contracts/        # @booking/contracts — zod schemas (src/contracts/*.ts) + types + i18n (vi/en)
│   ├── ui/               # @booking/ui — shadcn components, GenericForm, ImageUpload, Tailwind preset, theme CSS
│   ├── api-client/       # @booking/api-client — typed server-side HTTP client + interceptor + errors
│   ├── auth/             # @booking/auth — shared token + permission helpers
│   └── config/           # @booking/config — shared tsconfig / eslint / prettier / tailwind / vite presets
│                         #   (packages/shared is a deprecated artifact — superseded by @booking/contracts)
├── TONG-QUAN.md          # the authoritative design spec (English) — see also its §5 for this same tree
├── turbo.json            # Turborepo pipeline config
├── package.json          # Root workspace (pnpm workspaces)
├── pnpm-workspace.yaml   # Workspace glob config
├── tsconfig.base.json    # Shared strict TypeScript config
├── .env.example          # Template for environment variables
├── .env                  # NOT committed — copy from .env.example
├── docker-compose.yml    # Local postgres:16, redis:7, mailpit, minio
└── CLAUDE.md             # This file
```

> The API's internal layout (12 modules + 11 `shared/` concerns) is detailed in
> [§2.1](#21-phase-0--what-is-implemented-read-this-first) and [§5](#5-backend-architecture-nestjs--hexagonal).

### Package Manager

This project uses **pnpm** with pnpm workspaces. Never use npm or yarn directly.

### Root Scripts

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "db:migrate": "turbo run db:migrate --filter=api",
    "db:generate": "turbo run db:generate --filter=api",
    "db:seed": "turbo run db:seed --filter=api",
    "db:studio": "turbo run db:studio --filter=api"
  }
}
```

### Per-App Commands

```bash
# Run only backend in dev mode
pnpm turbo run dev --filter=api

# Run only a frontend
pnpm turbo run dev --filter=storefront
pnpm turbo run dev --filter=dashboard

# Build shared package first, then apps
pnpm turbo run build

# Run Prisma Studio
pnpm --filter=api exec prisma studio
```

### Turborepo Pipeline (turbo.json)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".react-router/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "lint": {},
    "type-check": { "dependsOn": ["^build"] },
    "db:migrate": { "cache": false },
    "db:generate": { "cache": false, "outputs": ["node_modules/.prisma/**"] },
    "db:seed": { "cache": false },
    "db:studio": { "cache": false, "persistent": true }
  }
}
```

---

## 5. Backend Architecture (NestJS + Hexagonal)

> **Always invoke `/nestjs` before writing NestJS code.**
> **Always invoke `/designing-architecture` before designing a new module.**

### Philosophy

The backend follows **Hexagonal Architecture** (Ports & Adapters / Clean Architecture).
The key rule: **domain logic never imports from NestJS, Prisma, or any framework**.

- **Domain layer**: Pure TypeScript classes (entities, value objects, port interfaces)
- **Application layer**: Use cases orchestrate domain objects; depend only on port interfaces
- **Infrastructure layer**: Concrete implementations (Prisma repositories, NestJS controllers, guards)

Dependencies always point **inward**: `Infrastructure → Application → Domain`

### Directory Layout

> Cross-cutting infrastructure lives under `src/shared/*` (NOT `src/common/` or `src/infrastructure/`);
> bounded contexts under `src/modules/*`. See [§2.1](#21-phase-0--what-is-implemented-read-this-first)
> for the full list of the 12 modules and 11 shared concerns.

```
apps/api/src/
├── main.ts                          # NestJS bootstrap (Helmet, CORS allowlist, throttling, global guards/pipe/filter)
├── app.module.ts                    # Root module wiring — imports every shared + feature module
├── shared/                          # cross-cutting infrastructure (no business logic)
│   ├── tenant-context/              # tenant-context (ALS), tenant-db.service (forTenant), interceptor
│   ├── prisma/                      # PrismaService (app_user/RLS) + PrismaAdminService (BYPASSRLS) + module
│   ├── redis/                       # redis.service + module (ioredis)
│   ├── outbox/                      # outbox.service + BullMQ relay
│   ├── audit/                       # AUDIT_WRITER port + PrismaAuditWriter — the one audit_logs write path
│   ├── storage/                     # S3/MinIO presign adapter + POST /uploads/presign
│   ├── validation/                  # zod validation pipe(s)
│   ├── openapi/                     # Swagger decorators/helpers
│   ├── health/                      # /health, /health/ready (Terminus)
│   ├── money/                       # VND bigint format/parse
│   └── time/                        # UTC timezone helpers
└── modules/                         # 12 bounded contexts (identity-access, tenancy, partner, catalog,
                                     #   listing, scheduling, booking, payments, promotions, finance,
                                     #   affiliate, notification) — each domain/ · application/ · infrastructure/
```

Guards/decorators/filters are NOT global folders — auth lives in
`modules/identity-access/infrastructure/http/{guards,decorators}` and the global
`AllExceptionsFilter` is registered in `main.ts`.

### Feature Module Layout (canonical shape — copy `modules/partner/` or `modules/booking/`)

```
modules/users/
├── domain/
│   ├── user.entity.ts (+ user.entity.spec.ts)   # pure domain + co-located spec; zero framework imports
│   ├── <sub>/                                    # optional grouping, e.g. listing/domain/moderation/
│   └── ports/
│       └── user-repository.port.ts  # interface IUserRepository + USER_REPOSITORY token (methods take a PrismaTx)
├── application/
│   ├── use-cases/
│   │   ├── create-user.use-case.ts  # one class per file; inject ports only; one forTenant() per operation
│   │   └── ...                       # optional sub-folder, e.g. use-cases/moderation/
│   ├── users.mapper.ts              # domain → response DTO — the ONLY place mapping lives
│   └── services/                    # optional app-layer helpers (validators, pricing)
└── infrastructure/
    ├── repositories/
    │   └── prisma-user.repository.ts # implements IUserRepository; every method takes a PrismaTx
    └── http/
        ├── public-user.controller.ts # controllers SPLIT BY AUDIENCE: public- / tenant- / partner- / admin-/platform-
        ├── tenant-user.controller.ts
        ├── dto/user.dto.ts           # createZodDto(<schema from @booking/contracts>)
        └── users.module.ts           # NestJS module — binds port → impl, registers use-cases + controllers
```

> **Reality vs. the boilerplate above:** the response **mapper lives in `application/<module>.mapper.ts`**
> (not `infrastructure/mappers/`), DTOs live in `infrastructure/http/dto/` (schemas come from
> `@booking/contracts`), and each module usually has **several audience-scoped controllers**, not one.

### Domain Entity Convention

```typescript
// modules/users/domain/entities/user.entity.ts
export class UserEntity {
  constructor(
    public readonly id: string,
    public readonly email: string,
    private _passwordHash: string,
    public readonly createdAt: Date,
    public isEmailVerified: boolean,
  ) {}

  verify(): void {
    this.isEmailVerified = true;
  }
  // No Prisma, no NestJS decorators — ever
}
```

### Port Interface Convention

```typescript
// modules/users/domain/ports/user-repository.port.ts
import { UserEntity } from '../entities/user.entity';

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  save(user: UserEntity): Promise<UserEntity>;
  delete(id: string): Promise<void>;
}

export const USER_REPOSITORY = 'USER_REPOSITORY';
```

### Use Case Convention

```typescript
// modules/users/application/use-cases/get-user.use-case.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports/user-repository.port';

@Injectable()
export class GetUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<UserEntity> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }
}
```

### Repository Implementation Convention

```typescript
// modules/users/infrastructure/repositories/prisma-user.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { IUserRepository } from '../../domain/ports/user-repository.port';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserEntity | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? UserMapper.toDomain(record) : null;
  }
  // ... other methods
}
```

### NestJS Module Wiring

```typescript
// modules/users/infrastructure/http/users.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import { PrismaUserRepository } from '../repositories/prisma-user.repository';
import { GetUserUseCase } from '../../application/use-cases/get-user.use-case';
import { UsersController } from './users.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [{ provide: USER_REPOSITORY, useClass: PrismaUserRepository }, GetUserUseCase],
  exports: [GetUserUseCase],
})
export class UsersModule {}
```

### Adding a New Feature Module (Checklist)

1. Create folder `modules/{feature}/`
2. Add `domain/entities/{feature}.entity.ts`
3. Add `domain/ports/{feature}-repository.port.ts` with interface + injection token
4. Add `application/use-cases/*.use-case.ts` (one file per use case)
5. Add `application/dtos/*.dto.ts`
6. Add `infrastructure/repositories/prisma-{feature}.repository.ts` — **methods accept a `PrismaTx`, not the raw client** (see Multi-tenancy below)
7. Add `infrastructure/mappers/{feature}.mapper.ts`
8. Add `infrastructure/http/{feature}.controller.ts` — apply `@RequirePermissions(...)` on every non-public route
9. Add `infrastructure/http/{feature}.module.ts` (binds port → impl)
10. Import the new module in `app.module.ts`
11. Add Prisma model to `schema.prisma` (with `tenant_id` if tenant-scoped) and run `pnpm db:migrate`
12. **If the model is tenant-scoped:** add a hand-written RLS migration (FORCE RLS + policy) — `db:check-rls` fails CI otherwise

### Multi-tenancy: `forTenant()` + RLS (the most important backend rule)

Tenant isolation is enforced by **Postgres Row-Level Security**, driven by the `app.tenant_id` GUC that
`forTenant()` sets on the transaction. Business code touches tenant data ONLY through this:

```typescript
// A use case does ONE forTenant() per whole business operation.
await this.tenantDb.forTenant(tenantId, async (tx) => {
  const listing = await tx.listing.create({ data: { tenantId /* ... */ } });
  await this.outbox.enqueue(tx, {
    // same tx → commits atomically
    tenantId,
    aggregateType: 'listing',
    aggregateId: listing.id,
    eventType: 'listing.created',
    payload: { id: listing.id },
  });
  return listing;
});
```

- Repositories receive the `tx` (`PrismaTx = Prisma.TransactionClient`), never the raw `PrismaService`.
- **Never nest** `forTenant()`; **never** call it per-query.
- The RLS-bound pool is `PrismaService` (`app_user`, `APP_DATABASE_URL`). Platform-admin / cross-tenant
  work (webhook resolution, reconciliation) uses `PrismaAdminService` (`app_admin`, BYPASSRLS) explicitly.
- Background jobs/webhooks have no request context — resolve `tenant_id` from the payload /
  `outbox_events.tenant_id` and call `forTenant()` yourself (the outbox relay already does this).

### Authorization: `@RequirePermissions`

```typescript
@RequirePermissions('tenant.listings.write')   // ANDed if multiple; scope from the session
@Post()
create(/* ... */) { /* ... */ }
```

`PermissionsGuard` is global and **deny-by-default**: any endpoint that is not `@Public()` and has no
`@RequirePermissions(...)` is rejected. Permissions are resolved from
`role_assignments → roles → role_permissions → permissions` within the request's scope and cached in
Redis; call `PermissionsService.invalidate(userId, scope)` wherever role assignments change. Permission
keys are `scope.resource.action` (see `phases/core.md` §14.2 / the seed).

### Inter-module communication: the outbox

Modules never import each other's services. Producer writes an event inside its `forTenant` tx
(`OutboxService.enqueue(tx, event)`); consumer registers a handler
(`OutboxService.on('listing.created', handler)`). The BullMQ relay dispatches each event inside
`forTenant(event.tenantId)` with retry/backoff and a dead-letter after max attempts.

### Prisma Schema Location

`apps/api/prisma/schema.prisma` — single file for all models.
Migrations live in `apps/api/prisma/migrations/`.

### Error Handling

Global `AllExceptionsFilter` registered in `main.ts`. Domain errors use standard NestJS
HTTP exceptions thrown from use cases. Never leak Prisma errors to the HTTP layer.

---

## 6. Frontend Architecture (React Router 7 SSR)

> **Always invoke `/react-patterns` before writing React components.**
> **Always invoke `/shadcn` before building a UI component — check the registry first.**
> **Always invoke `/tailwind-css-patterns` for layout and styling work.**
> **Always invoke `/web-design-guidelines` after any visual change.**

> **Current state:** `apps/storefront` and `apps/dashboard` have **real Phase-1 routes** — the
> storefront (home, catalog `t/:typeSlug`, listing `l/:listingSlug`, checkout, bookings,
> become-partner) and the dashboard (`/admin`, `/tenant`, `/partner`, `/affiliate` areas, config-based
> routing in `app/routes.ts` + per-area `routes.ts`/`nav.ts`). The patterns below (loaders/actions,
> `lib/*.server.ts`, `GenericForm`) are the live conventions. The storefront resolves its tenant from
> the `Host` header; the dashboard from the login session. Some example file paths in older snippets
> (e.g. `routes/dashboard/items/*`) are illustrative placeholders from the removed template.

### Philosophy

React Router 7 in framework mode acts as a full-stack framework. Each route file exports:

- `loader` — server-side data fetching (runs on server only)
- `action` — server-side mutation handling (POST/PUT/DELETE)
- default export — React component (renders server + client)

**The frontend never calls the backend API from the browser for authenticated requests.**
All authenticated data fetching goes through `loader` functions (server-to-server HTTP calls).
JWT tokens live in an `httpOnly` cookie session only — never exposed to JavaScript.

### Directory Layout

```
apps/storefront/   # (and apps/dashboard/ — same shape; layout below is the Phase-1 target)
├── app/
│   ├── root.tsx                      # App shell, global providers, error boundary
│   ├── routes/
│   │   ├── _index.tsx                # Public landing page
│   │   ├── auth/
│   │   │   ├── login.tsx             # Login form + action
│   │   │   ├── register.tsx          # Register form + action
│   │   │   └── logout.tsx            # POST-only logout action
│   │   └── dashboard/
│   │       ├── _layout.tsx           # Auth-gated shell with nav
│   │       ├── _index.tsx            # Dashboard home
│   │       ├── profile.tsx           # User profile
│   │       └── items/
│   │           ├── _index.tsx        # Items list with pagination
│   │           ├── new.tsx           # Create item form
│   │           └── $itemId.tsx       # Item detail + edit + delete
│   ├── globals.css                   # Thin: @import '@booking/ui/globals.css' + app-only styles
│   ├── components/                   # APP-SPECIFIC components only (layout, one-off widgets).
│   │                                 # Reusable UI lives in packages/ui — see below.
│   └── lib/
│       ├── api.server.ts             # Server-side fetch helpers (backend calls)
│       ├── session.server.ts         # Cookie session: get/set/destroy JWT tokens
│       └── auth.server.ts            # requireUser, requireRole helpers
├── react-router.config.ts
├── vite.config.ts                    # ssr.noExternal: ['@booking/ui'] — ui ships raw TSX
├── tailwind.config.ts                # Thin: presets: [@booking/ui/tailwind-preset] + content globs
├── components.json                   # shadcn/ui CLI config (ui/utils aliases → @booking/ui)
├── postcss.config.js
└── package.json
```

### Shared UI Package (`@booking/ui`)

**All reusable UI lives in `packages/ui`, not in the app** — the monorepo hosts multiple
frontend apps and they must share one component library and one theme. See
[Section 8](#8-shared-packages) for the package layout and import paths. In app code:

```typescript
import { Button } from '@booking/ui/components/ui/button';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { cn } from '@booking/ui/lib/utils';
```

Rules:

- **Never copy shadcn primitives into an app.** Add them to `packages/ui` (see the cookbook:
  [How to Add a shadcn/ui Component](#how-to-add-a-shadcnui-component)).
- A component goes in `app/components/` only when it is truly app-specific (e.g. that app's
  navbar). The moment a second app needs it, move it to `packages/ui`.
- Each app's `tailwind.config.ts` stays thin: it consumes the shared preset and only sets
  `content` globs — which must include `../../packages/ui/src/**/*.{ts,tsx}` or the shared
  components' classes won't be generated.
- Theme tokens (CSS variables, dark mode, radius) live in `packages/ui/src/styles/globals.css`;
  apps import it and never redefine tokens locally.

### Color & Theming (semantic tokens only)

**Style every UI surface with shadcn semantic tokens — never hardcoded palette colors.** This keeps
the look consistent and, on the storefront, lets each tenant's `theme_config` re-tint the whole app.

- **Use the tokens, always:**
  - Text: `text-foreground` (primary), `text-muted-foreground` (secondary).
  - Surfaces: `bg-background` (page), `bg-card` (panels), `bg-muted` (subtle fills); lines: `border-border`.
  - Brand (tenant-driven): `text-primary` / `bg-primary` / `border-primary` (+ `-foreground` pairs), and
    `ring-ring` for focus. Errors: the `destructive` token (`text-destructive`, `bg-destructive/10`).
- **Never for a themed surface:** `text-gray-*` / `bg-gray-*` / `border-black/*` / `bg-black/*` /
  `bg-white` / `text-white`, or app-local color CSS vars. A change that adds one is wrong — reach for a
  token. (The legacy storefront `--sf-*` vars are being retired; only `--sf-background` remains, for the
  page canvas.)
- **Interactive elements** that aren't shadcn primitives must carry a visible focus ring
  (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).
- **Narrow exceptions (literal colors OK):** text/scrims that sit *on a photo/video* (e.g. a hero
  overlay: `text-white`, `from-black/70`), and universal status semantics with no token (success
  green/emerald). Everything else uses tokens.

**Storefront tenant branding.** `theme_config.colors` drive the shadcn base tokens via a single
SSR-injected `<style>:root{…}</style>` — see `apps/storefront/app/theme/theme.ts` (`themeCss`) +
`root.tsx`. Rules when touching this:

- Tokens are wired with Tailwind v4 `@theme inline { --color-primary: var(--primary) }`, so utilities
  inline `var(--primary)` — override the **base `--primary`** (never `--color-primary`).
- Tenant color strings are **untrusted** (tenant jsonb): always pass them through `sanitizeColor()`
  before they enter CSS (defeats `</style>`/CSS injection). Derive readable text with `contrastToken()`;
  never hardcode a foreground.

### Loader Pattern (Data Fetching)

```typescript
// routes/dashboard/items/_index.tsx
import type { Route } from './+types/_index';
import { requireUser } from '~/lib/auth.server';
import { apiGet } from '~/lib/api.server';

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request); // redirects to /auth/login if no session
  const url = new URL(request.url);
  const page = url.searchParams.get('page') ?? '1';

  const data = await apiGet(`/items?page=${page}`, user.accessToken);
  return { items: data.items, total: data.total, page: Number(page) };
}

export default function ItemsPage({ loaderData }: Route.ComponentProps) {
  const { items, total, page } = loaderData;
  // Zero browser-side data fetching needed
}
```

### Action Pattern (Mutations)

```typescript
// routes/dashboard/items/new.tsx
import type { Route } from './+types/new';
import { redirect } from 'react-router';
import { requireUser } from '~/lib/auth.server';
import { apiPost } from '~/lib/api.server';

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();

  const result = await apiPost(
    '/items',
    {
      name: formData.get('name'),
      description: formData.get('description'),
    },
    user.accessToken,
  );

  if (!result.ok) return { errors: result.errors };
  return redirect('/dashboard/items');
}
```

### Forms — use `GenericForm` (schema-driven)

**All data-entry forms must use the generic form** from `@booking/ui/components/form/` rather
than hand-rolled `<Form>` + inputs. It is built on **react-hook-form + zod + shadcn** and is the
canonical pattern for every validated form (auth, profile, item CRUD, and all future features).

- `packages/ui/src/components/form/generic-form.tsx` — orchestrator: `useForm` + `zodResolver`,
  responsive grid layout, conditional fields, submit handling.
- `packages/ui/src/components/form/field-renderer.tsx` — maps a field config entry to the right
  shadcn control.
- `packages/ui/src/components/form/combobox-field.tsx`, `date-field.tsx` — composed Popover-based
  controls.
- `packages/ui/src/components/form/types.ts` — the `FieldConfig<T>` discriminated union.

**Rules (do not deviate):**

1. **Validation comes from a zod schema in `@booking/shared`.** The form's value type is always
   `z.infer<typeof schema>`. Add a schema to `packages/shared/src/contracts/*.ts` first; never
   define a form's schema inline in a route. This keeps frontend + backend validation identical.
2. **Field config lives in the consuming app's route** (it carries labels/widgets/layout —
   presentation), typed as `FieldConfig<z.infer<typeof schema>>[]` (import the type from
   `@booking/ui/components/form/types`). The `name` of each field is type-checked against the
   schema, so a wrong name is a compile error. Keep `@booking/shared` framework-free.
3. **Submission flows through the route's server `action`.** `GenericForm` validates on the client,
   then submits the values as JSON via `useSubmit`. The `action` re-validates with the **same shared
   schema** (`schema.safeParse(await request.json())`) before calling the backend — JWT stays in the
   httpOnly cookie (never call the backend from the browser).
4. **Return errors as data, not throws.** On a zod failure return
   `data({ fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 })`; on a backend error
   return `data({ error }, { status: 400 })`. Pass `actionData` straight into `serverError` /
   `fieldErrors` props — `GenericForm` renders the form-level alert and maps field errors onto inputs.
5. **Supported field types:** `text | email | password | url | number | textarea | select | combobox
| radio | checkbox | switch | date | file`. Dynamic layout via `columns`, per-field `colSpan`, and a
   `hidden(values)` predicate. Optional text fields submit blank as `undefined` automatically (the
   form reads the schema's `.isOptional()`), so optional rules like `url()`/`min(1)` don't misfire.
6. **Image upload (`type: 'file'`):** uploads directly to object storage and submits the resulting
   **URL string(s)** — never a `File` — so the JSON submission model is unchanged. Config:
   `{ type: 'file', target: 'listings'|'groups'|'partners'|'tenants', multiple?, accept?, maxSizeMb?,
   maxFiles? }`; the field value is a `string` (single) or `string[]` (multiple), so the shared schema
   uses `z.string().url()` / `z.array(z.string().url())`. Mechanics: the browser POSTs a same-origin
   **presign proxy** resource route (`/uploads/presign` — see `apps/dashboard/app/routes/uploads.presign.tsx`)
   which replays the auth cookie to the backend `POST /uploads/presign` (`@AuthenticatedOnly`), then the
   browser PUTs the bytes straight to MinIO/S3. The reusable `ImageUpload`
   (`@booking/ui/components/form/image-upload`) also works **outside** GenericForm (see the hand-rolled
   listing + listing-type forms). Favicons accept `.ico` via `FAVICON_ACCEPT`. An app that uploads must
   define its own `/uploads/presign` resource route (the storefront has none — partner uploads happen
   post-registration in the dashboard).

**TS note:** schemas with `.transform()`/`.default()` have differing input/output types; for those,
build a dedicated form with the 3-arg `useForm<In, Ctx, Out>` instead of `GenericForm`.

Canonical examples: `routes/auth/login.tsx` (simple), `routes/dashboard/profile.tsx` (optional
fields), `routes/dashboard/items/$itemId.tsx` (edit with `defaultValues` + a separate FormData
delete button — the `action` branches on `content-type`).

**Not for:** action-only buttons (logout) and GET filter/search forms (e.g. the items list search) —
those stay plain React Router `<Form>` elements.

### Session Handling (JWT Storage)

Tokens stored in a server-side `httpOnly` cookie. Never accessible from browser JavaScript.

```typescript
// lib/session.server.ts
import { createCookieSessionStorage } from 'react-router';

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__session',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    secrets: [process.env.SESSION_SECRET!],
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;
```

### auth.server.ts Helpers

```typescript
// lib/auth.server.ts
import { redirect } from 'react-router';
import { getSession } from './session.server';

export async function requireUser(request: Request) {
  const session = await getSession(request.headers.get('Cookie'));
  const accessToken = session.get('accessToken');
  if (!accessToken) throw redirect('/auth/login');
  return { accessToken, userId: session.get('userId') as string };
}
```

### Adding a New Route (Checklist)

1. Create `app/routes/{section}/{name}.tsx`
2. Export `loader` if server data is needed
3. Export `action` if the route handles mutations
4. Export default React component, receive `loaderData` / `actionData` as props
5. Use `requireUser(request)` in both loader and action for protected routes
6. Invoke `/shadcn` before building any UI — use registry components
7. Invoke `/web-design-guidelines` after the visual layout is done

---

## 7. Auth Flow (`modules/identity-access`)

Every actor (customer, partner, tenant admin, platform admin, affiliate) is a `users` row.
Passwords are **Argon2id** (never bcrypt/plaintext). Access tokens are short-lived JWTs; refresh
tokens are opaque random strings stored **hashed** (SHA-256) as `Session` rows and **rotated** on use.

### Registration — `POST /auth/register`

1. `RegisterUseCase` checks the email is unique, hashes the password with **Argon2id**, creates a `users` row.
2. Returns `201 { id }`. (Email verification is a Phase-1 addition — not in Phase 0.)

### Login — `POST /auth/login`

1. `LoginUseCase` loads the user and checks the lockout window + `status`.
2. Verifies the password (Argon2id). On failure it increments `failed_login_attempts`; the **5th**
   consecutive failure sets `locked_until` (15-min lockout). Errors never reveal which field was wrong.
3. On success: resets the counter, issues an access-token JWT + a fresh refresh token, and stores the
   refresh token's hash as a `Session`. Returns `{ accessToken, refreshToken, expiresIn }`.

### Refresh — `POST /auth/refresh`

`RefreshTokenUseCase` hashes the presented token, finds the `Session`, validates it (not expired/revoked),
**revokes it (rotation)**, and issues a new pair. Reusing an old refresh token fails.

### Logout — `POST /auth/logout`

Revokes the refresh token's `Session` (idempotent).

### Config & guards

- Access token TTL from `JWT_EXPIRES_IN` (default `15m`), HS256, signed with `JWT_SECRET`.
- Refresh token TTL 7 days; hashed in the `Session` table; single-use (rotated).
- `JwtAuthGuard` (global) validates the access token; `@Public()` bypasses it.
- The **frontend BFF** owns the `httpOnly` cookie — the browser never reads tokens (see §6).

### Backend Auth Module Layout

```
modules/identity-access/
├── domain/ports/
│   ├── identity-repository.port.ts   # IIdentityRepository + IDENTITY_REPOSITORY (users + sessions)
│   ├── password-hasher.port.ts       # IPasswordHasher + PASSWORD_HASHER
│   └── token-service.port.ts         # ITokenService + TOKEN_SERVICE
├── application/use-cases/
│   ├── register.use-case.ts
│   ├── login.use-case.ts             # + login.use-case.spec.ts (lockout tests)
│   ├── refresh-token.use-case.ts
│   └── logout.use-case.ts
└── infrastructure/
    ├── repositories/prisma-identity.repository.ts
    ├── services/argon2-password.service.ts   # IPasswordHasher (Argon2id, OWASP params)
    ├── services/jwt-token.service.ts          # ITokenService (JWT access + opaque refresh)
    └── http/{auth.controller.ts, auth.module.ts}
```

---

## 8. Shared Packages

Five workspace packages are shared across apps (`packages/shared` is a **deprecated** leftover —
contracts moved to `@booking/contracts`):

| Package              | Consumed by             | Contents                                                                                                         |
| -------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@booking/contracts` | backend + all frontends | zod schemas (`src/contracts/*.ts`) + inferred types + i18n (vi/en) — framework-free, built to `dist/`. The FE↔BE contract. |
| `@booking/ui`        | all frontends           | shadcn components, GenericForm, ImageUpload, `cn()`, Tailwind preset, theme CSS — raw TSX, compiled by each app's Vite |
| `@booking/api-client`| all frontends (server)  | typed server-side HTTP client + interceptor + error types — used in RR7 loaders/actions                          |
| `@booking/auth`      | all frontends (server)  | shared token + permission helpers                                                                                |
| `@booking/config`    | every package/app       | shared presets: `tsconfig` · `eslint` · `prettier` · `tailwind` · `vite`                                         |

### `@booking/contracts` — Structure

```
packages/contracts/
├── src/
│   ├── index.ts                       # Barrel: re-exports every contracts/*.ts + i18n messages
│   ├── contracts/                     # one file per bounded context, zod schema + z.infer type
│   │   ├── common.ts   auth.ts   tenancy.ts   partner.ts   listing-type.ts   listing.ts
│   │   ├── availability.ts   booking.ts   payment.ts   promotion.ts   finance.ts
│   │   ├── affiliate.ts   platform.ts   storage.ts
│   │   └── *.spec.ts                   # co-located schema specs
│   └── i18n/
│       ├── vi.json                     # Vietnamese messages (default locale)
│       └── en.json
├── package.json                        # dual ESM/CJS build → dist/
└── tsconfig.json
```

### Usage

```typescript
// Backend (schemas + types) and frontend both import from the built package
import { createBookingInputSchema, type BookingResponse } from '@booking/contracts';
```

### Convention

- Only pure TypeScript types, Zod schemas, and utility functions. Zero framework imports.
- Types are the canonical DTOs — backend validates against them, frontend types against them.
- DTOs in `packages/shared` are the transport layer contract. Domain entities map to/from these.
- The only allowed barrel file: `packages/shared/src/index.ts`.

### `@booking/ui` — Structure

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── ui/                        # shadcn/ui primitives (button, input, dialog, …)
│   │   └── form/                      # GenericForm system (see Section 6 Forms)
│   ├── lib/
│   │   └── utils.ts                   # cn() — clsx + tailwind-merge
│   └── styles/
│       └── globals.css                # @tailwind directives + theme CSS variables (light/dark)
├── tailwind-preset.ts                 # Shared Tailwind theme preset (colors, radius, container, animate)
├── components.json                    # shadcn CLI config — CLI writes new components HERE
├── package.json                       # Subpath exports (no build step — ships TSX source)
└── tsconfig.json
```

### `@booking/ui` — Usage

```typescript
// Components & utils (subpath imports — no barrel file, no deep relative paths)
import { Button } from '@booking/ui/components/ui/button';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { cn } from '@booking/ui/lib/utils';
```

```typescript
// apps/{app}/tailwind.config.ts
import type { Config } from 'tailwindcss';
import uiPreset from '@booking/ui/tailwind-preset';

export default {
  presets: [uiPreset],
  content: ['./app/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
} satisfies Config;
```

```css
/* apps/{app}/app/globals.css */
@import '@booking/ui/globals.css';
```

### `@booking/ui` — Convention

- **No build step.** The package exports raw `.tsx`/`.ts` source via `package.json` subpath
  `exports`; each app's Vite compiles it. Every consuming app must therefore add
  `ssr: { noExternal: ['@booking/ui'] }` in its `vite.config.ts`.
- **No barrel file.** Import via subpaths (`@booking/ui/components/ui/button`) — matches how the
  shadcn CLI generates imports and keeps tree-shaking trivial.
- `react`, `react-dom`, `react-router`, and `zod` are **peerDependencies** — apps own those
  versions. Radix, cva, cmdk, lucide, react-hook-form, etc. are regular dependencies of the
  ui package; frontends do not declare them.
- Components under `src/components/ui/` are shadcn copies — **never hand-modify them**; regenerate
  via the shadcn CLI. Composed/custom shared components (like the form system) live in sibling
  folders (`src/components/form/`, `src/components/{domain}/`).
- The Tailwind preset defines the theme only — `content` globs are per-app (presets don't merge
  `content`).

---

## 9. User Stories & Roadmap

The product scope, actors, money flow, booking state machine, RBAC catalog, and phase roadmap live in
the spec, not here:

- **[`phases/core.md`](./phases/core.md)** — the full design document (§2 actors, §3 money flow,
  §7 data model, §8 booking state machine, §14 RBAC, §21 roadmap). Vietnamese: `phases/core.vi.md`.
- **[`docs/superpowers/plans/booking-saas-tasks/`](./docs/superpowers/plans/booking-saas-tasks/)** —
  self-contained implementation tickets per phase (`phase-0-foundation/` … `phase-3-new-verticals/`),
  each with context, deliverable, spec excerpts, gotchas, and an acceptance checklist. **Start here when
  picking up the next piece of work.**

Phase 0 (foundation) is done — see [§2.1](#21-phase-0--what-is-implemented-read-this-first). Phase 1
(Studio MVP: listings, availability, hourly/daily/inventory booking, PayOS, commissions, promos) is the
next milestone; work through `phase-1-studio-mvp/` in ticket order.

---

## 10. Coding Conventions

### General

- TypeScript strict mode is mandatory (`"strict": true` in all tsconfig.json)
- No `any` types. Use `unknown` and narrow. ESLint: `@typescript-eslint/no-explicit-any: error`
- All non-trivial functions must have explicit return types
- Prefer `const` over `let`. Never `var`.
- No barrel files inside feature modules — they create circular dependency risk.
  **Exception**: `packages/shared/src/index.ts` is the only allowed barrel.

### Naming Conventions

| Artifact          | Convention               | Example                      |
| ----------------- | ------------------------ | ---------------------------- |
| Files             | kebab-case               | `create-user.use-case.ts`    |
| Classes           | PascalCase               | `CreateUserUseCase`          |
| Interfaces        | PascalCase               | `IUserRepository`            |
| Port token consts | SCREAMING_SNAKE_CASE     | `USER_REPOSITORY`            |
| Prisma models     | PascalCase               | `User`, `RefreshToken`       |
| DB table names    | snake_case (Prisma maps) | `users`, `refresh_tokens`    |
| React components  | PascalCase               | `ItemCard`                   |
| Route files       | kebab-case or $param     | `_index.tsx`, `$itemId.tsx`  |
| Hooks             | camelCase, `use` prefix  | `useOptimisticItems`         |
| Env variables     | SCREAMING_SNAKE_CASE     | `DATABASE_URL`, `JWT_SECRET` |

### File Structure Rules

- One use case class per file.
- One entity per file.
- One port interface per file.
- Controller methods stay thin: validate HTTP input → call use case → return response. Zero business logic.
- Mappers handle ALL transformations between layers. Never inline mapping in controllers or use cases.

### Testing Conventions

- Unit tests: `*.spec.ts` co-located next to the source file
- E2E tests: `apps/api/test/` directory, named `*.e2e-spec.ts`
- Test use cases in isolation using mocked port interfaces (no DB required)
- Test repositories against a real test database (`DATABASE_URL_TEST`)
- Frontend: Playwright for E2E, Vitest for component/unit tests

### Import Aliases

- `~/` → `app/` in frontend
- `@/` → `src/` in backend
- `@booking/shared` → `packages/shared` in both apps
- `@booking/ui/*` → `packages/ui/src/*` in frontends (subpath exports; e.g. `@booking/ui/components/ui/button`)
- Never use relative imports that go up more than 2 levels

### Git Conventions

- Branch: `feat/`, `fix/`, `chore/`, `docs/` prefix
- Commits: Conventional Commits format (`feat: add item pagination`)
- PR requires passing CI (build + lint + type-check + test)
- Invoke `/managing-git` for branch strategy and PR workflows

---

## 11. Environment Variables

Copy `.env.example` to `.env` at the root. **The Prisma CLI and the backend also read
`apps/api/.env`** (Prisma only loads an `.env` from the directory it runs in), so the backend's
DB/Redis/JWT vars must be present there — see `apps/api/.env`.

```dotenv
# ──────────────────────────────────────────────
# Database — dual pools for RLS (§6.3 of phases/core.md)
# ──────────────────────────────────────────────
# Owner/superuser: Prisma migrations + the BYPASSRLS admin pool (PrismaAdminService).
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/project_dev"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5433/project_test"
# Non-superuser, RLS-bound app_user pool (PrismaService / forTenant). RLS only enforces on a
# non-superuser role — created by the rls_policies_and_roles migration.
APP_DATABASE_URL="postgresql://app_user:app_user_pw@localhost:5432/project_dev"

# ──────────────────────────────────────────────
# Redis (holds, BullMQ outbox relay, permissions cache)
# ──────────────────────────────────────────────
REDIS_URL="redis://localhost:6379"

# ──────────────────────────────────────────────
# Auth (Argon2id password hashing; JWT access tokens)
# ──────────────────────────────────────────────
JWT_SECRET="change-me-in-production-min-32-chars"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_SECRET="another-secret-change-me"
REFRESH_TOKEN_EXPIRES_IN="7d"

# ──────────────────────────────────────────────
# Frontend Session
# ──────────────────────────────────────────────
SESSION_SECRET="yet-another-secret-change-me"

# ──────────────────────────────────────────────
# Backend API (used by frontend server-side only)
# ──────────────────────────────────────────────
BACKEND_URL="http://localhost:3001"

# ──────────────────────────────────────────────
# Application
# ──────────────────────────────────────────────
PORT=3001
STOREFRONT_PORT=3000
DASHBOARD_PORT=3002
NODE_ENV=development
# CORS allowlist — both frontends (comma-separated; add preview URLs here).
FRONTEND_URL="http://localhost:3000,http://localhost:3002"

# ──────────────────────────────────────────────
# Object storage — MinIO (dev) / S3 / R2 (prod)
# ──────────────────────────────────────────────
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"

# ──────────────────────────────────────────────
# Email (Mailpit in dev)
# ──────────────────────────────────────────────
SMTP_HOST="localhost"
SMTP_PORT=1025
EMAIL_FROM="noreply@example.com"

# ──────────────────────────────────────────────
# Observability
# ──────────────────────────────────────────────
LOG_LEVEL="debug"   # trace | debug | info | warn | error | fatal
```

**FRONTEND_URL** supports a comma-separated allowlist for preview deploys, e.g.
`FRONTEND_URL="http://localhost:3000,http://localhost:3002,https://preview.example.com"`.
Toggle the outbox relay off in tests with `OUTBOX_RELAY_DISABLED=true`.

---

## 12. Running, Testing, and Building

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (Postgres 16, Redis 7, MinIO, Mailpit via `docker compose`)
- Redis is required from Phase 0 (outbox relay, permissions cache) — `docker compose up -d` starts it

### First-Time Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env file and configure
cp .env.example .env

# 3. Start local services (Docker)
docker compose up -d

# 4. Run database migrations
pnpm db:migrate

# 5. Generate Prisma client
pnpm db:generate

# 6. Seed database with test data
pnpm db:seed

# 7. Start all apps
pnpm dev
```

### Development

```bash
pnpm dev                                     # All apps in parallel
pnpm turbo run dev --filter=api          # Backend only (port 3001)
pnpm turbo run dev --filter=storefront       # Storefront only (port 3000)
pnpm turbo run dev --filter=dashboard        # Dashboard only (port 3002)
```

### Database

```bash
pnpm db:migrate                              # Run pending migrations
pnpm db:generate                             # Regenerate Prisma client after schema changes
pnpm db:seed                                 # Seed permissions + system roles + demo tenant
pnpm db:studio                               # Open Prisma Studio GUI
pnpm --filter=api db:check-rls           # CI: every tenant_id table has FORCE RLS + policy
pnpm --filter=api db:check-rls:isolation # CI: prove tenant A can't read tenant B

# Create a new migration after editing schema.prisma:
pnpm --filter=api exec prisma migrate dev --name add-listings-table
# Tenant-scoped tables ALSO need a hand-written RLS migration (see the cookbook).
```

### Testing

```bash
pnpm test                                   # All unit tests
pnpm turbo run test --filter=api        # Backend unit tests (jest)
pnpm turbo run test --filter=@booking/shared # Shared unit tests (vitest — money/time)

# E2E (requires running apps + test DB):
pnpm --filter=api run test:e2e
pnpm --filter=storefront run test:e2e       # Playwright
```

### Linting & Type Checking

```bash
pnpm lint                                   # ESLint across all packages
pnpm type-check                             # tsc --noEmit across all packages
```

### Building

```bash
pnpm build                                  # Build all (shared → apps)

# Production start:
node apps/api/dist/main.js
pnpm --filter=storefront start
pnpm --filter=dashboard start
```

---

## 13. Common Patterns (Cookbook)

### How to Add a New Use Case

1. Create `modules/{feature}/application/use-cases/{action}-{feature}.use-case.ts`
2. Decorate with `@Injectable()`
3. Inject port(s) via constructor using `@Inject(PORT_TOKEN)`
4. Implement `execute(dto): Promise<Output>` method — only domain + application logic
5. Add to `providers` array in the feature's NestJS module
6. Call from the controller (inject the use case directly)

### How to Add a New API Endpoint

1. Add use case (see above)
2. In the controller, add a method with the appropriate HTTP decorator
3. `JwtAuthGuard` + `PermissionsGuard` are global — mark the route `@Public()` or, for a protected
   route, `@RequirePermissions('scope.resource.action')` (deny-by-default: a protected route with no
   permission fails closed)
4. Map domain entity → DTO via a Mapper before returning
5. Add request/response schemas + types to `@booking/shared` (`src/contracts/*.ts`)
6. Invoke `/designing-apis` to verify naming and status codes

### How to Add a Tenant-Scoped Feature (RLS)

1. Add the Prisma model with `tenantId String @map("tenant_id") @db.Uuid` + `@@index([tenantId])`.
   Run `pnpm --filter=api exec prisma migrate dev --name add-{feature}`.
2. **Add a hand-written RLS migration** (Prisma can't express RLS). Create a new migration folder and
   `migration.sql` with (copy the shape from `*_rls_policies_and_roles/migration.sql`):
   ```sql
   ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON "{table}"
     USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
     WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
   ```
   Apply with `pnpm --filter=api exec prisma migrate deploy`.
3. In the repository, methods take a `PrismaTx` (never the raw client). In the use case, wrap the whole
   operation in `this.tenantDb.forTenant(tenantId, async (tx) => { ... })`.
4. Verify: `pnpm --filter=api db:check-rls` (policy present) and `db:check-rls:isolation` (it works).

### How to Add a Permission

1. Add the key (`scope.resource.action`) to the catalog in `apps/api/prisma/seed.ts` and, if it
   belongs to a system role, to that role's list. Re-run `pnpm db:seed` (idempotent).
2. Guard the endpoint with `@RequirePermissions('scope.resource.action')`.
3. When you build role-management endpoints, call `PermissionsService.invalidate(userId, scope)` on any
   role-assignment change so the Redis cache doesn't serve stale permissions.

### How to Emit / Handle a Domain Event (Outbox)

- **Emit** (producer), inside the business `forTenant` tx:
  ```ts
  await this.outbox.enqueue(tx, {
    tenantId,
    aggregateType: 'booking',
    aggregateId: booking.id,
    eventType: 'booking.confirmed',
    payload: { bookingId: booking.id },
  });
  ```
- **Handle** (consumer), register in the module's `onModuleInit`:
  ```ts
  this.outbox.on('booking.confirmed', async (event, tx) => {
    /* tx is RLS-scoped to event.tenantId */
  });
  ```
  The relay runs handlers inside `forTenant(event.tenantId)` with retry/backoff and dead-letters after
  max attempts. Never import another module's service directly.

### How to Add a New Frontend Page

1. Create `app/routes/{section}/{name}.tsx`
2. Export `loader` for data, `action` for mutations
3. Use `requireUser(request)` in both — destructure `{ accessToken, session }`
4. Call backend via `apiGet(path, accessToken, session)` etc. — passing `session` enables auto-refresh on 401
5. Default export the React component with typed props
6. For any data-entry form, use `GenericForm` (see [How to Add a Form](#how-to-add-a-form)); use
   shadcn primitives from `@booking/ui/components/ui/*` only for non-form UI
7. Invoke `/shadcn` if you need a primitive not yet in `packages/ui/src/components/ui/` — add it
   to the ui package, not the app (see [How to Add a shadcn/ui Component](#how-to-add-a-shadcnui-component))
8. Invoke `/web-design-guidelines` after layout is complete

### How to Add a Form

Use `GenericForm` for every validated data-entry form (see [Forms](#forms--use-genericform-schema-driven)).

1. Add (or reuse) a zod schema in `packages/shared/src/contracts/*.ts`; export its
   `z.infer` type. Run `pnpm build --filter=@booking/shared`.
2. In the route, define the field config: `const fields: FieldConfig<MyInput>[] = [...]`
   (`FieldConfig` from `@booking/ui/components/form/types`, `GenericForm` from
   `@booking/ui/components/form/generic-form`) — `name`s are type-checked against the schema;
   set `type`, `label`, `placeholder`, `colSpan`, `autoComplete`.
3. Render `<GenericForm schema={mySchema} fields={fields} submitLabel="…" serverError={…} fieldErrors={…} />`.
   Pass `defaultValues` for edit forms, `columns`/`colSpan` for multi-column layout.
4. In the `action`: `const parsed = mySchema.safeParse(await request.json())`; return
   `data({ fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 })` on failure, otherwise
   call the backend with `parsed.data` via `apiPost/apiPatch(path, parsed.data, accessToken, session)`.
5. Invoke `/shadcn` if a field needs a control not yet added under `packages/ui/src/components/ui/`.

### How to Add a shadcn/ui Component

All shadcn primitives live in `packages/ui` so every frontend shares them. Never add one to an app.

1. Invoke `/shadcn` first — confirm the component exists in the registry.
2. Run the CLI **from the ui package**: `cd packages/ui && pnpm dlx shadcn@latest add <component>`
   — its `components.json` writes the file to `src/components/ui/` with `@booking/ui/*` imports.
3. If the component pulls in a new Radix (or similar) dependency, it belongs in
   `packages/ui/package.json` — the CLI installs it there; never add it to an app.
4. Verify the generated imports use `@booking/ui/lib/utils` / `@booking/ui/components/ui/*`
   (not `~/`); fix if the CLI guessed wrong.
5. Import it in apps via `@booking/ui/components/ui/<component>`.

### How to Add a Custom Shared Component

1. If it composes shadcn primitives for reuse across apps, create it under
   `packages/ui/src/components/{domain}/` (see `src/components/form/` as the model).
2. Import siblings via `@booking/ui/...` aliases or same-folder relative imports.
3. If it needs a new subpath pattern, extend `exports` in `packages/ui/package.json`
   (`./components/*` already covers `.tsx` files; plain `.ts` files need an explicit entry —
   see `./components/form/types`).
4. App-specific components (that app's navbar, a one-off widget) stay in the app's
   `app/components/` — promote them to `packages/ui` the moment a second app needs them.

### How to Add a New Frontend App

1. Scaffold `apps/{name}` (React Router 7 framework mode, same as `apps/storefront`).
2. `package.json`: depend on `"@booking/shared": "workspace:*"` and `"@booking/ui": "workspace:*"`;
   do **not** add Radix/cva/clsx/lucide/react-hook-form — they come with `@booking/ui`.
3. `vite.config.ts`: add `ssr: { noExternal: ['@booking/ui'] }` and a distinct dev port.
4. `tailwind.config.ts`: `presets: [uiPreset]` + `content` globs including
   `'../../packages/ui/src/**/*.{ts,tsx}'` (copy from `apps/storefront`).
5. `app/globals.css`: `@import '@booking/ui/globals.css';` and import it in `root.tsx`.
6. `components.json`: copy from `apps/storefront` (aliases `ui`/`utils` point at `@booking/ui`).
7. Copy `app/lib/{api,session,auth}.server.ts` patterns for backend access, add the app's URL to
   the backend `FRONTEND_URL` allowlist, and set a port env var.
8. Turborepo picks the app up automatically via `pnpm-workspace.yaml` (`apps/*`) — verify with
   `pnpm build && pnpm type-check && pnpm lint`.

### How to Add a Shared Type

1. Create or update `packages/shared/src/types/{domain}.types.ts`
2. Export the type/interface/enum
3. Re-export from `packages/shared/src/index.ts`
4. Run `pnpm build --filter=@booking/shared` (the filter is the package name, not `shared`;
   the frontend imports schema **values** from the built `dist`, so rebuild after changes)
5. Import: `import { MyDto } from '@booking/shared'`

### How to Add a Prisma Model

1. Add model to `apps/api/prisma/schema.prisma`
2. Run: `pnpm --filter=api exec prisma migrate dev --name your-migration-name`
3. Run: `pnpm db:generate` to update the client
4. Follow the full feature module checklist (section 5)

### Pagination Pattern (Backend)

Standard response shape (defined in `packages/shared`):

```typescript
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

Use `PaginationQuery` DTO (`{ page: number, pageSize: number, search?: string }`) and
a shared `paginate<T>()` utility in the use case layer.

### Error Response Shape

All errors follow RFC 7807 Problem Details format (handled by `AllExceptionsFilter`):

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Item abc123 not found"
}
```

Never return Prisma error details, stack traces, or internal IDs to the client.

---

_End of CLAUDE.md — keep this file updated as the project evolves._
