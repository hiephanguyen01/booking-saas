# ADR 0005 — No automated tests

**Status:** Accepted.

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
