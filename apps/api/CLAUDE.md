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
  TenantDbService, OutboxService, RedisService, S3StorageService…) and port-implementing adapters in
  `infrastructure/` (e.g. `permission-resolver.service.ts`).

**One use-case = one file** — one exported `@Injectable XxxUseCase`, single public `execute()`.
Controllers inject **use-cases only** (plus mappers/pipes and, exceptionally, `TenantContextService`).
Response mapping lives in `application/<module>.mapper.ts` — never inline in a controller/use-case.

Module shape (copy `modules/partner/` or `modules/booking/`):
`domain/{entities, ports}` · `application/{use-cases, <module>.mapper.ts}` ·
`infrastructure/{repositories, http/{controllers split by audience, dto, <module>.module.ts}}`.
Controllers are split by audience: `public-` / `tenant-` / `partner-` / `admin-`.

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
(FORCE RLS + `tenant_isolation` policy), then `prisma:deploy`, then `check:rls`. `prisma migrate dev`
is **not** used — see [`../../docs/decisions/0004-hand-written-migrations.md`](../../docs/decisions/0004-hand-written-migrations.md).

## Authorization

`SessionAuthGuard` then `PermissionsGuard` are global (plus `ThrottlerGuard` + `ZodDtoValidationPipe`).
Deny-by-default: a route must be `@Public()`, `@AuthenticatedOnly()`, or carry
`@RequirePermissions('scope.resource.action')` — else `403 NO_PERMISSION_DECLARED`.

The client names its scope with `x-tenant-id` / `x-partner-id` headers; the guard verifies the user
actually holds a role assignment there (never trusting the header for data access), then seeds the
tenant context for RLS. Permission keys + system roles are a fixed catalog in
`src/modules/identity-access/domain/permission-catalog.ts` (39 keys, 7 roles), seeded from code —
never created via UI. After any role-assignment change call `PermissionResolverService.invalidate(userId)`
(one arg) to clear the Redis cache.

## Inter-module communication — outbox for side effects

**Write-path side effects only.** Never call another module to *cause* a state change; emit an event
so the change and its effects commit together. Synchronous **reads** across modules are fine through
the other module's use-case or repository port, as are guards/decorators/Nest modules from
`identity-access` and `tenancy`. Two things are hard-enforced: `domain/` may not import another
module's `application/` (eslint), and the module import graph must stay acyclic
(`pnpm check:module-cycles`, in CI). Logic two contexts genuinely share is not an import — move it to
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
`prisma:generate` · `prisma:deploy` · `seed` · `storage:init` · `check:rls`. Run via
`pnpm --filter=@booking/api <script>`.
