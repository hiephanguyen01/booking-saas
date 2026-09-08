# apps/api — @booking/api (NestJS 11, hexagonal, RLS-aware)

Local rules for the backend. Root context: [`../../AGENTS.md`](../../AGENTS.md). Cross-cutting
conventions & the error envelope: [`../../docs/conventions.md`](../../docs/conventions.md).

## The request flow — `controller → use-case → repository-port → repository`

No service classes in the application layer. When tempted to write one, use the sanctioned alternative:

- **Pure computation** (pricing, attribute validation, journal-line math) → a **pure function in
  `domain/`**. Plain-import it, no DI.
- **A reusable operation that needs ports** → a **use-case** other use-cases inject
  (e.g. `ResolveCommissionUseCase`).
- **A technical capability** (crypto, external API, cache) → a **port in `domain/ports/` + adapter in
  `infrastructure/`**, bound in the module.
- The only allowed `*.service.ts` are cross-cutting infra in `src/shared/*` (PrismaService,
  TenantDbService, TenantContextService, OutboxService…) and port-implementing adapters in
  `infrastructure/services/` (e.g. `permission-resolver.service.ts`, `s3-storage.service.ts`). There
  is no `RedisService` — `shared/redis` provides the raw ioredis client under the `REDIS` token.

**One use-case = one file** — one exported `@Injectable XxxUseCase`, single public `execute()`.
Controllers inject **use-cases only** (plus mappers/pipes and, exceptionally, `TenantContextService`).
Response mapping lives in `application/<module>.mapper.ts` — never inline in a controller/use-case.

Module shape (copy `modules/partner/` or `modules/booking/`):
`domain/{entities, errors, ports, value-objects}` · `application/{use-cases, <module>.mapper.ts}` ·
`infrastructure/{repositories, services, http/{controllers split by audience, dto, <module>.module.ts}}`.

**One file = one class = one audience.** A controller file holds exactly one `@Controller`, and its
name carries the audience prefix — `public-` / `tenant-` / `partner-` / `admin-` / `platform-` /
`customer-` / `affiliate-` — matching the class name (`tenant-listing.controller.ts` →
`TenantListingController`). Two audiences means two files.

The suffix says what the file IS, and it is separated by a **dot**, not a hyphen:

| Folder | Suffix | Example |
| --- | --- | --- |
| `domain/entities/` | `.entity.ts` | `partner.entity.ts` |
| `domain/value-objects/` | `.value-object.ts` | `rating.value-object.ts` |
| `domain/ports/` | `.port.ts` | `tenancy-config.port.ts` |
| `domain/errors/` | `-errors.ts` | `partner-errors.ts` |
| `application/use-cases/` | `.use-case.ts` | `get-partner.use-case.ts` |
| `application/` | `.mapper.ts`, `-http-errors.ts` | `partner.mapper.ts` |
| `infrastructure/repositories/` | role: `.repository.ts` · `.reader.ts` · `.store.ts` · `.lookup.ts` … | `prisma-busy.reader.ts` |
| `infrastructure/http/` | `.controller.ts`, `.module.ts`, `.pipe.ts` | `tenant-listing.controller.ts` |
| `infrastructure/http/dto/` | `.dto.ts` | `listing.dto.ts` |

## Entity and error policy

- Write-path invariants/state transitions live on framework-free entities, VOs or pure domain
  policies; use-cases orchestrate `load → rehydrate/create → domain method → save → emit`.
- Do not invent entities for query/projection, adapter-backed state machines, CAS/set-based
  transitions or provider-boundary validation. These paths still use ports; no direct Prisma model
  access/raw SQL in application code.
- Entities/VOs/errors import no Nest, Prisma, application or infrastructure code and perform no I/O
  or clock reads. External facts are method arguments.
- Never inline a custom Nest error envelope in a use-case. Standard 4xx errors are named
  `DomainError`s in `domain/errors/`; exact cross-module tuples live once in
  `shared/domain/errors/`.
- Same code with different frozen messages stays as separate named classes. Auth retry fields,
  legacy HTTP bodies, webhook/provider shapes and 5xx use named Nest exceptions in
  `application/*-http-errors.ts`; `DomainError` is 4xx-only.
- Domain transitions and repository CAS are both required: pass the loaded status/version/timestamp
  into the write, return an explicit miss, throw a named 409 before audit/outbox, and never replace a
  guarded update with unconditional load-check-save.
- HTTP/provider JSON is typed and validated at the edge. Use discriminated unions for
  provider-specific credentials, validate decrypted stored JSON before adapter construction, and
  fail closed rather than filling absent secrets with `''`. Open `unknown` JSON is limited to
  documented dynamic config/snapshots or untrusted payloads that are immediately narrowed.
- Response mappers list contract fields explicitly; do not spread Prisma/read records into HTTP
  responses because persistence-only keys become accidental wire contracts.

The full decision rules and wire-freeze requirements are in
[`docs/conventions.md`](../../docs/conventions.md#entityuse-case-decision) and
[`Backend error placement`](../../docs/conventions.md#backend-error-placement).

## Multi-tenancy — `forTenant()` + RLS (the most important rule)

```ts
await this.tenantDb.forTenant(tenantId, async (tx) => {          // ONE tx per business operation
  const listing = await tx.listing.create({ data: { tenantId /* … */ } });
  await this.outbox.emit(tx, {                                   // same tx → commits atomically
    tenantId, eventType: 'listing.created', payload: { id: listing.id },
  });
  return listing;
});
```

`TenantDbService.forTenant` (`src/shared/tenant-context/tenant-db.service.ts`) opens a transaction on
the RLS-bound `app` pool and runs `SELECT set_config('app.tenant_id', $id, true)` so the
`tenant_isolation` policy applies. Repositories take the `tx` (`PrismaTx`), never the raw client.
Never nest `forTenant`; never call it per-query. Cross-tenant / platform work (webhooks,
reconciliation) uses the `admin` pool (BYPASSRLS) explicitly, resolving `tenant_id` from the payload.

Two Prisma pools live in **one** `PrismaService`: `prisma.app` (`DATABASE_URL`, app_user, RLS) and
`prisma.admin` (`ADMIN_DATABASE_URL`, app_admin, BYPASSRLS). Migrations run as
`MIGRATE_DATABASE_URL` (superuser). There is **no** `PrismaAdminService` class (older docs invented it).

Adding a tenant-scoped table: add the model with `tenant_id`, then a **hand-written RLS migration**
(FORCE RLS + `tenant_isolation` policy), then `prisma:deploy`, then `pnpm test` (RLS coverage guard). `prisma migrate dev`
is **not** used — see [`../../docs/decisions/0004-hand-written-migrations.md`](../../docs/decisions/0004-hand-written-migrations.md).

## Authorization

`SessionAuthGuard` then `PermissionsGuard` are global (plus `ThrottlerGuard` + `ZodDtoValidationPipe`).
Deny-by-default: a route must be `@Public()`, `@AuthenticatedOnly()`, or carry
`@RequirePermissions('scope.resource.action')` — else `403 NO_PERMISSION_DECLARED`.

The client names its scope with `x-tenant-id` / `x-partner-id` headers; the guard verifies the user
actually holds a role assignment there (never trusting the header for data access), then seeds the
tenant context for RLS. Permission keys + system roles are a fixed catalog in
`src/modules/identity-access/domain/permission-catalog.ts` (56 keys, 7 roles), seeded from code —
never created via UI. After any role-assignment change call `PermissionResolverService.invalidate(userId)`
(one arg) to clear the Redis cache. **Adding a key to the catalog needs a seed run to reach the
database**, and seeding does not invalidate that cache — until it expires, holders keep getting 403.

## Inter-module communication — outbox for side effects

**Write-path side effects only.** Never call another module to *cause* a state change; emit an event
so the change and its effects commit together. Synchronous **reads** across modules are fine through
the other module's use-case or repository port, as are guards/decorators/Nest modules from
`identity-access` and `tenancy`. Two things are hard-enforced: `domain/` may not import another
module's `application/` (eslint), and the module import graph must stay acyclic
(the module-cycle guard in `pnpm test`, in CI). Logic two contexts genuinely share is not an import — move it to
`src/shared/domain/*`, alongside the existing `pricing/`, `availability/`, `commission/` and `errors/`
kernels. Full boundary table in [ADR 0003](../../docs/decisions/0003-outbox-for-inter-module.md).

Producer: `OutboxService.emit(tx, { tenantId?, eventType, payload })` inside its `forTenant` tx.
Consumer: `OutboxHandlerRegistry.register(eventType, handler)` (in the module's `onModuleInit`). The
BullMQ relay (`src/shared/outbox/outbox-relay.worker.ts`) delivers each event with exponential backoff
(poll 2s, batch 20, `FOR UPDATE SKIP LOCKED`, backoff capped 300s). After 20 failed delivery
attempts it parks the row by setting `dead_lettered_at`; parked rows are excluded from future claims.
There is no
`OutboxService.enqueue`/`.on` (older docs invented those). Time comparisons use the **DB clock**
(`now()`), never `Date.now()`. The `outbox_events.aggregate_type`/`aggregate_id` columns exist but are
currently unpopulated.

When one module must write another module's table **inside the same transaction** (too tightly coupled
to the caller's own invariant for an outbox event — e.g. the shared invitation-accept flow writing
`partner_members`), the *caller's* module declares the port and the *owner* module provides it from a
`@Global()` module, not the other way round — that keeps the existing import direction intact and
the module-cycle guard green (see `PARTNER_MEMBERSHIP_WRITER` / `PartnerMembershipWriterModule`).

## Use-case unit tests ([ADR 0009](../../docs/decisions/0009-limited-tests-policy.md))

Every use case carries **one** unit test beside it: `xxx.use-case.ts` → `xxx.use-case.spec.ts`. It is
required for every use case, and `tests/architecture/use-case-unit-tests.test.ts` fails the build
for any that lacks one. There is no allowlist: the backfill list this policy shipped with reached
zero on 2026-08-20 and was deleted with it.

Construct the class directly, never through the Nest container:

```ts
import { fakePort, fakeTenantDb } from '~testing';

const tenantDb = fakeTenantDb();
const resources = fakePort<IResourceRepository>({ findById: () => Promise.resolve(resource()) });
const useCase = new ListAvailabilityExceptionsUseCase(resources, exceptions, tenantDb.service);
```

Four fakes live in `apps/api/testing/`, outside `src/` so `tsconfig.build.json` cannot compile them
into a bundle:

| Fake | For | What it buys you |
| --- | --- | --- |
| `fakeTenantDb({ now })` | `TenantDbService` | Runs the callback and records the tenant `forTenant` was opened with — assert `tenantDb.openedFor` to prove **one** transaction, for the right tenant. Pass `now` when the use case reads `databaseNow`, and make it a different date from any service date in the test, or the two clocks cannot be told apart. |
| `fakePort<IXxx>({ … })` | a repository port | Throws **by name** on any method the test did not stub, so a use case that starts calling a second port fails loudly instead of reading `undefined`. |
| `fakeTx({ partner: { findUnique } })` | `PrismaTx` | For the minority of use cases that read the transaction directly instead of going through a port. Touching an unstubbed model throws. |
| `fakeCollaborator<XxxUseCase>({ … })` | a dependency injected by **concrete class** | A class with private fields is not assignable from an object literal, so the stub shape cannot be type-checked. Prefer a real port where one exists. |

Assert what the use case decides: which port it called with what, which domain error it threw, the
order of side effects. Do **not** try to assert rollback, RLS, the GiST exclusion constraint or outbox
delivery — the fakes cannot see them, and pretending otherwise is worse than no test. Those stay
runtime smoke. Run with `pnpm test:api` from the workspace root; there is no package-level `test`
script.

## Bootstrap, errors, config

`src/main.ts` sets Helmet (CSP relaxed only when docs are enabled), `cookie-parser`, `rawBody: true`
(gateway webhook signatures), shutdown hooks, Swagger (non-prod or `SWAGGER_ENABLED=true`), and
`PORT` (default 3000). **There is no `enableCors`.** There is ONE global exception filter:
`DomainExceptionFilter` (`src/shared/domain/domain-exception.filter.ts`, wired via `APP_FILTER`) —
it only catches framework-free `DomainError`s thrown by entities/VOs and emits the standard envelope
`{ statusCode, code, message, details? }`; everything else keeps Nest's default handling.
Application code uses NestJS `HttpException` only through named HTTP-boundary error classes described
above; never restore inline payload literals. Never leak Prisma errors. Env vars are read via
`process.env`; API bootstrap, Prisma CLI, seed, and storage scripts all load the single workspace-root
`.env` (see `.env.example`). Never add an app-local env file.

## Scripts (verified)

`dev` / `start:dev` (both `prisma generate && nest start --watch`) · `build` · `lint` · `typecheck` ·
`prisma:generate` · `prisma:deploy` · `seed` · `storage:init`. Run via `pnpm --filter=@booking/api
<script>`. Tests are **not** a package script — they run from the workspace root (`pnpm test`,
`pnpm test:api`).
