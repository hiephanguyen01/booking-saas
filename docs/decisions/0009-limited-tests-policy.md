# ADR 0009 — Limited tests: one unit test per use case, plus the architecture guards

**Status:** Accepted (2026-08-19). Supersedes [ADR 0005](./0005-no-tests-policy.md).

## Context

[ADR 0005](./0005-no-tests-policy.md) banned automated tests outright. Two things about the codebase
have since made the total ban cost more than it saves.

The **use-case layer turned out to be trivially testable.** [ADR 0006](./0006-hexagonal-no-services.md)
removed service classes, so a use case depends on ports and `TenantDbService` and nothing else. It can
be constructed directly over fakes — no Nest container, no Prisma, no Redis, no HTTP. There are 343 of
them, and they are where the business rules actually live: default windows, ownership checks, stale-version
guards, commission arithmetic. A unit test there costs a few lines and does not lie, because there is no
integration seam for it to mock away.

The **architecture rules had grown into a parallel test framework anyway.** `scripts/architecture/*.mjs`
plus `apps/api/scripts/check-rls.ts` were 1,050 lines of hand-rolled assertion, reporting and exit codes:
seven bespoke runners, seven output formats, one `check:*` npm script each, seven CI steps. They are
tests in everything but name, and re-implementing `expect` was the only thing the ban bought us.

## Decision

Tests are allowed in exactly two shapes. Everything else remains forbidden.

**1. One use case, one unit test.** `apps/api/src/**/*.use-case.spec.ts`, beside the use case it covers.
Required for every use case. The 341 that predated this ADR were backfilled over the following
weeks; the allowlist reached zero on 2026-08-20 and was deleted, so the guard now admits no
exceptions at all.

**2. Architecture guards.** `tests/architecture/*.test.ts`, one file per rule, each reading files and
asserting. These are the seven former scripts, converted rather than rewritten.

**Still forbidden:** integration and e2e suites, browser drivers (Playwright, Cypress), component tests
in either frontend, tests for controllers or repositories, and any runner other than Vitest. The reason
is unchanged from ADR 0005 — behaviour is verified by running the real applications against real
infrastructure, and a broad mocked suite would buy confidence it has not earned.

`tests/architecture/test-policy.test.ts` enforces every sentence of this section.

## Consequences

- `pnpm test` replaces seven commands and seven CI steps. It needs no database, no Redis and no built
  workspace package; it runs straight after `pnpm install` in about two seconds.
- Vitest is a devDependency of the workspace root and `@booking/api`, and of nowhere else.
- `apps/api/testing/` holds the shared fakes (`fakeTenantDb`, `fakePort`). It sits outside `src/`, so
  `tsconfig.build.json` cannot compile it into a bundle; specs import it as `~testing`.
- A use-case test asserts the ports were called correctly and the right domain error was thrown. It
  **cannot** assert rollback, RLS, the GiST exclusion constraint or anything else the database does —
  those stay runtime smoke, exactly as ADR 0005 required.
- The RLS coverage check kept its blind spot in the move: it audits tables that have a `tenant_id`
  column, so a join table such as `role_permissions` is still invisible to it.

## Verification

```bash
pnpm test                 # architecture guards + use-case unit tests
pnpm turbo lint typecheck build
```

Then start the affected application and manually exercise the changed flows. For concurrency,
idempotency, money and tenancy changes, perform focused runtime smoke with real database transactions
and record exactly what could or could not be verified.
