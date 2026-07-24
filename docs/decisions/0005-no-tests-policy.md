# ADR 0005 — Targeted automated tests

**Status:** Accepted (supersedes the former no-tests policy on 2026-07-24).

## Context

The repository previously prohibited every automated test and relied on lint, typecheck, build, manual
verification, and static architecture scripts. That kept the toolchain small, but it left security and
concurrency behavior without executable regression coverage. The suspended-tenant guard and distributed
session-refresh lock demonstrated that type correctness alone cannot prove request-ordering invariants.

## Decision

Automated tests are allowed and expected where they protect high-risk behavior:

- security boundaries and tenant isolation;
- authentication, session rotation, locking, and other concurrency-sensitive flows;
- money, commission, ledger, date/time, and idempotency invariants;
- parsers, validators, and pure domain functions with meaningful edge cases.

Keep tests deterministic, focused, and close to the code they protect. Prefer the smallest runner that
fits the package. Storefront server unit tests use Node's built-in `node:test` runner with Node's
TypeScript type stripping, so no test framework dependency is required. Do not introduce broad snapshot
suites, brittle implementation-detail assertions, or browser end-to-end infrastructure without a clear
risk-based reason.

## Verification

The standard repository check is:

```bash
pnpm test
pnpm turbo lint typecheck build
```

Storefront CI also runs its static security gate and `pnpm --filter=@booking/api check:rls`. Manual flow
verification remains required for user-visible or integration-heavy changes; automated tests supplement
rather than replace it.

## Consequences

- Security-critical regressions can be reproduced and blocked in CI.
- Test infrastructure grows incrementally instead of requiring an all-at-once coverage target.
- Packages without meaningful tests may omit a `test` script until risk justifies one.
- Static architecture checks remain appropriate for repository-wide structural invariants such as RLS
  migration coverage.
