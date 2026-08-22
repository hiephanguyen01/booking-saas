# ADR 0005 — No automated tests

**Status:** Superseded by [ADR 0009](./0009-limited-tests-policy.md) (2026-08-19).

> ADR 0009 relaxes this decision in two places and only two: a use case may — and now must — carry
> one unit test beside it, and the architecture guards moved from `scripts/*.mjs` into
> `tests/architecture/`. Everything else below still holds, including the reasoning for it. Read this
> ADR for *why* the repo has no broad suite; read ADR 0009 for what is allowed.

## Context

The owner has chosen a no-tests policy for this repository. Verification stays operational and
static: TypeScript, lint, production builds, architecture/RLS checks and running the real
applications against local infrastructure.

## Decision

Do not add automated tests of any kind:

- no `*.test.*`, `*.spec.*`, `__tests__`, integration or e2e files;
- no Jest, Vitest, Playwright or other test-runner configuration/dependencies;
- no `test`/`test:*` package scripts, Turborepo test task or CI test steps.

This decision overrides tickets, generated plans and generic framework guidance that ask for tests.

## Verification

Use:

```bash
pnpm turbo lint typecheck build
pnpm --filter=@booking/api check:rls
```

Then start the affected application and manually exercise the changed flows. For concurrency,
idempotency, money and tenancy changes, perform focused runtime smoke with real database transactions
and record exactly what could or could not be verified.

## Consequences

- The repository has no executable regression suite.
- Static checks and realistic runtime smoke are mandatory, not optional substitutes.
- Review plans must not smuggle in test files/config under another name.
