# Conventions

Cross-cutting conventions. Backend-only rules are in [`../apps/api/CLAUDE.md`](../apps/api/CLAUDE.md);
per-app frontend rules in the app `CLAUDE.md` files. Hard rules are in [`../AGENTS.md`](../AGENTS.md).

## TypeScript & naming

- Strict mode everywhere; `noUncheckedIndexedAccess` on. **No `any`** — use `unknown` and narrow
  (ESLint errors on `@typescript-eslint/no-explicit-any`). Explicit return types on non-trivial
  functions. `const` over `let`; never `var`. `consistent-type-imports` is enforced (import types with
  `import type`) — **except** in `apps/api/**`, where it's off because NestJS DI relies on
  `emitDecoratorMetadata`.
- No barrel files inside feature modules (circular-dep risk). Allowed barrels: the package roots
  `packages/{contracts,i18n,query,ui}/src/index.ts`.
- Files kebab-case; classes/interfaces/React components PascalCase; interfaces prefixed `I`; port tokens
  `SCREAMING_SNAKE_CASE`; Prisma models PascalCase → snake_case tables; env vars `SCREAMING_SNAKE_CASE`.
- Aliases: `~/` → `app/` (dashboard uses it everywhere; storefront prefers relative imports),
  `@/` → `src/` (backend). Prettier: single quotes, trailing commas `all`, print width 100.

## Backend (hexagonal)

`controller → use-case → repository-port → repository`, **no service classes**, **one use-case per
file** (single public `execute()`). Full rules + the sanctioned alternatives to a service (pure domain
function / injectable use-case / port+adapter) are in [`../apps/api/CLAUDE.md`](../apps/api/CLAUDE.md)
and [ADR 0006](./decisions/0006-hexagonal-no-services.md). Tenant data flows through
`TenantDbService.forTenant`; modules talk via the outbox; authz is `@RequirePermissions`
deny-by-default. See [`architecture.md`](./architecture.md).

### Entity/use-case decision

Entity-centric is the permanent backend convention, not a requirement that every use-case instantiate
an entity:

- A **write-path business invariant or state transition** belongs on a framework-free aggregate in
  `domain/entities/`, a value object in `domain/value-objects/`, or a pure named domain policy. The
  use-case orchestrates `load → rehydrate/create → domain method → save → emit`; it does not repeat
  the rule with inline `if` statements.
- Use `static rehydrate(state)` for persisted state and `static create/open(...)` for new state.
  Rehydrate only the fields the aggregate needs. Domain methods receive external facts such as DB
  time, ownership or related-record existence as arguments; entities/VOs never read the clock,
  database, network, Nest container or environment themselves.
- A **query/read projection**, adapter-backed state machine, guarded CAS/set-based transition,
  provider-boundary validation or outbox projection does not need a fake entity when it owns no
  invariant/state. It still goes through a local repository port; application code must not contain
  direct Prisma model calls or raw SQL.
- Persistence races and set-based atomicity remain in repository adapters/DB constraints. An entity
  may reject an invalid requested transition, but it must not pretend to replace the CAS, unique,
  GiST, ledger or RLS authority.
- Entity/VO/error code is framework-free: no imports from Nest, Prisma, `application/` or
  `infrastructure/`. Do not add getters/methods without a real consumer, and do not create an anemic
  wrapper merely to make a use-case count as “using an entity”.

The completed refactor's rationale and historical module map remain in
[the design spec](./superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md); new code
follows the convention above without reopening that migration plan.

### Concurrency and typed boundaries

- Every load-check-write state transition has two authorities: the entity/pure domain policy rejects
  an illegal requested edge, and the repository guards persistence with the loaded pre-image
  (`WHERE status = expected`, version, `updated_at`, unique/GiST constraint, advisory lock, etc.).
  Replacing the second half with an unconditional save reopens TOCTOU/lost-update races.
- A guarded repository method returns an explicit CAS outcome (`record | null`, boolean or a named
  result). The use-case translates a miss to a named 409 and writes audit/outbox only after a
  successful mutation. Never re-read and report success after a guard matched zero rows unless that
  idempotent quirk is an explicitly documented contract.
- Request bodies/queries use a Zod contract at the HTTP edge. Provider-specific input uses a
  discriminated union (for example payment `gateway → credentials`), not
  `Record<string, string>` plus downstream key guessing. Preserve a legacy validation envelope with
  a named boundary pipe when the standard pipe would change its code/message.
- Encrypted/decrypted JSON and persisted provider payloads cross a trust boundary: parse and validate
  them before constructing an adapter or returning a domain/read record. Missing credentials must
  fail closed; never coerce them to empty strings.
- `unknown`/open JSON is allowed only where the product is genuinely dynamic or the input is
  untrusted and immediately narrowed: tenant theme/settings, listing attributes/mode config,
  historical snapshots and incoming outbox/provider payloads. Document such fields; do not let
  accidental `unknown` spread through ports. Response mappers enumerate contract keys explicitly so
  persistence column names cannot leak through object spread.

### Backend error placement

Never repeat a custom error envelope inline in a use-case
(`throw new NotFoundException({ statusCode, code, message, ... })`). Choose its home by semantics:

1. **Standard 4xx business/read/access error** → a named, framework-free `DomainError` in the owning
   module's `domain/errors/`; throw only the named class at call-sites. `DomainExceptionFilter`
   produces `{ statusCode, code, message, details? }`.
2. **The exact status + code + message tuple is emitted by more than one module** → define it once in
   `apps/api/src/shared/domain/errors/`. A module may re-export an alias to keep an existing import
   seam, but must not mint a duplicate class.
3. **Same code but intentionally different message/details** → keep distinct, explicitly named
   classes. Do not deduplicate semantically different wire contracts by code alone.
4. **Auth retry metadata, legacy non-standard body, webhook/provider boundary or other HTTP-only
   shape** → a named Nest exception in `application/*-http-errors.ts`. Preserve special top-level
   fields such as `retryAfterSec`/`attemptsRemaining`; do not force these through `DomainError`.
5. **Defensive/unreachable failure or 5xx** → ordinary `Error` or a named Nest 5xx exception at the
   application/infrastructure boundary. `DomainError` is a 4xx-only convention. A bare Nest
   exception is allowed only when the default Nest body is the intentional frozen contract.

For every refactor, freeze HTTP status, code, message, details and legacy envelope shape before
moving the error. `details` may be an object or array. Never leak Prisma errors, stack traces,
credentials or internal implementation details.

## Frontend (React Router 8 framework mode)

- Each route exports `loader` (server data), `action` (server mutation), and a default component
  receiving `loaderData` / `actionData`. Protected routes resolve identity in a root `middleware` +
  area guards, not ad-hoc per route.
- **BFF: never fetch the backend from the browser.** All authenticated data goes through
  loaders/actions calling `@booking/api-client` (via each app's `app/lib/api.server.ts`:
  `apiGet`/`apiPost`/`apiPatch`/`apiPut`/`apiDelete` + `unwrapApiResult`/`requireData`/`unwrapList`).
  The session cookie is `httpOnly`. Browser-reachable modules may only `import type` from `*.server`
  files. See [ADR 0001](./decisions/0001-opaque-sessions-over-jwt.md).
- Style with **shadcn semantic tokens only** (`bg-background`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `text-primary`/`bg-primary`, `ring-ring`, `destructive`) —
  never `text-gray-*`/`bg-white`/hardcoded palette on a themed surface. Non-primitive interactive
  elements need a visible focus ring (`focus-visible:ring-2 focus-visible:ring-ring
  focus-visible:ring-offset-2`). Narrow exceptions: text/scrims over a photo, universal status green.
- **Branch and name UI by the schema's structural enums, never by a specific listing type or vertical.**
  Which renderer, dialog, or component a listing gets is a function of its structural fields
  (`BookingSelection` = `flexible_duration` | `fixed_packages`, `BookingMode`, `ListingStructure`) —
  read those, e.g. `if (listing.bookingSelection === 'fixed_packages')`. Do **not** gate on a
  listing-type slug or vertical name (`listingTypeSlug === 'photography'`, `'studio'`, `'salon'`, …),
  and do **not** name files, components, exports, or i18n namespaces after one vertical
  (`PhotographerPage`, `photographer.*`). Name them after the structural concept (`PackageListingPage`,
  `packages.*`). A vertical name in structural code is a bug: it silently mis-renders every other
  listing type that shares the same booking selection. Vertical-specific *content* (e.g. a photography
  attribute row) is fine only when it renders conditionally on the data being present.

### Forms — always `GenericForm`

Every validated data-entry form uses `GenericForm` (`@booking/ui/components/form/generic-form`), built
on react-hook-form + zod + shadcn. Rules:

1. Validation comes from a zod schema in **`@booking/contracts`** (never inline in a route). The value
   type is `z.infer<typeof schema>`.
2. Field config lives in the route (labels/widgets/layout), typed `FieldConfig<z.infer<typeof
   schema>>[]` (from `@booking/ui/components/form/types`) — field `name`s are compile-checked against
   the schema.
3. Submission flows through the route `action`, which **re-validates with the same schema**
   (`schema.safeParse(await request.json())`) before calling the backend.
4. Return errors as data, not throws: on zod failure
   `data({ fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 })`; on backend error
   preserve the upstream `4xx`/`5xx` status (use `errorStatus`) instead of flattening it to `400`.
   Pass `actionData` into `serverError`/`fieldErrors`.
5. Field types: `text | email | password | url | number | textarea | select | combobox | radio |
   checkbox | switch | date | file`. `type:'file'` uploads to object storage and submits the URL
   string(s) — the schema uses `z.string().url()` / `z.array(z.string().url())`.
6. Schemas with `.transform()`/`.default()` (differing in/out types) → build a dedicated
   `useForm<In, Ctx, Out>` instead of `GenericForm`.

Not for: action-only buttons (logout). GET search/filter on **list pages** goes through `ListToolbar`
(below); other one-off GET forms stay plain `<Form>`.

### List pages — `ListToolbar` + filter spec (dashboard)

Every server-paginated list page in `apps/dashboard` filters through one shared, URL-driven mechanism —
do not hand-roll a `<Form method="get">` with `<Input>`/`<NativeSelect>` per page.

1. **Declare a filter spec** — a `FilterSpec` (`~/lib/list-filters`): an array of typed field
   descriptors (`text` | `enum` | `date-range`). It is the single source of truth: both the loader
   (parsing) and the component (rendering) import the same spec, so they cannot drift. Put a spec shared
   by multiple pages in the feature's `lib/` (e.g. `features/reviews/lib/review-filters.ts`); a
   page-local spec can live in the route module.
2. **Loader** — `const { filters, apiFilters } = readListFilters(url.searchParams, SPEC);` then feed
   `apiFilters` into the existing `readListParams(...).toApiQuery(apiFilters)`. `readListFilters` trims
   text, drops invalid enum values, and converts `date-range` to ISO day-bounds. Return `filters` for
   the controlled inputs.
3. **Component** — render `<ListToolbar spec={SPEC} filters={filters} resetHref={dashboardPaths.…}
   pageSize={pageSize} />`. Text search is debounced (~300ms) auto-submit via `useSubmit`; selects/dates
   submit immediately; any submit drops `page` (→ page 1) and preserves `pageSize` + every URL param the
   toolbar doesn't own (so an adjacent `<StatusFilterTabs>` `status` survives a search). Use
   `hasActiveFilters(filters)` for the empty-state copy.
4. **Backend** — a list endpoint's query schema is `paginationQuerySchema.extend({ q, status?, from?,
   to? })` in `@booking/contracts`; the repo adds `where` clauses (`OR … { contains, mode:
   'insensitive' }` for `q`, equality for enums, `createdAt`/timeslot range for dates) **inside the
   existing `forTenant` tx**. See the promotions / booking modules for the reference implementation.

Status that reads best as a tab row with count chips keeps `<StatusFilterTabs>` (it lives beside the
toolbar, not inside the spec). No column sorting yet — lists keep their default ordering.

## Error envelope

There is **no RFC-7807 filter**. The de-facto contract is a NestJS `HttpException` body extended with an
app-level `code`: `{ statusCode, code, message, details? }`. Known codes:
`VALIDATION_ERROR` (+ `details: zodError.flatten()`, from `shared/validation/zod-dto-validation.pipe.ts`),
`NO_PERMISSION_DECLARED` / `MISSING_PERMISSION` (guard), and auth codes from the session guard.
`@booking/api-client` parses `{ message, error, code, details.fieldErrors }`. Never leak Prisma errors,
stack traces, or internal IDs. Backend placement and deduplication rules are in
[Backend error placement](#backend-error-placement).

## Migrations

Hand-authored — **do not run `prisma migrate dev`** (it's not the workflow here). To add/change schema:

1. Edit `apps/api/prisma/schema.prisma`.
2. Create a new timestamped folder under `apps/api/prisma/migrations/` with a `migration.sql` you write
   by hand. For a tenant-scoped table, include the RLS block:
   ```sql
   ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "<table>" FORCE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON "<table>"
     USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
     WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
   ```
3. `pnpm --filter=@booking/api prisma:deploy` then `pnpm --filter=@booking/api prisma:generate`.
4. `pnpm --filter=@booking/api check:rls` (a static schema↔SQL check; runs in CI). It cannot prove the
   policy works at runtime — sanity-check against the dev DB when touching RLS itself.

**No-touch SQL zones:** the RLS role/policy migrations, the ledger triggers/constraints, and the
bookings GiST exclusion constraint. See [ADR 0004](./decisions/0004-hand-written-migrations.md).

## i18n & language policy

- **Storefront** is bilingual (`vi` | `en`) via `@booking/i18n` (i18next locale modules under
  `packages/i18n/src/locales/{en,vi}/<namespace>.ts`, typed by `translation-shape.ts`). Add a
  user-facing string to the right namespace in both locales.
- **Dashboard** is **Vietnamese-hardcoded** (no i18n wiring). New dashboard UI text is Vietnamese.
- **API messages** are mixed (some Vietnamese transport/guard messages, some English). Match the
  surrounding module; user-facing customer messages lean Vietnamese.

## Testing & verification ([ADR 0005](./decisions/0005-no-tests-policy.md))

Automated tests are prohibited by owner decision: no test files, test runners/config, `test` scripts
or CI test steps. Verify with `pnpm turbo lint typecheck build`, static architecture/RLS checks, then
run the app and exercise changed flows manually. Requires **Node ≥ 22.22.0** — React Router 8 refuses
to run below it.
