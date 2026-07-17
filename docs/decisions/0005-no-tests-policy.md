# ADR 0005 — No tests, by owner decision

**Status:** Accepted (owner policy; documented 2026-07-17).

## Context

The repo ships **zero tests** deliberately. Tickets, the design spec (`TONG-QUAN.md` §22 "Testing
Strategy"), and some skills still mention tests — those are superseded by this decision.

## Decision

No tests, ever:

- Never create `*.spec.*`, `*.test.*`, `*.e2e-spec.*`, or a `test/`/`e2e/`/`__tests__` directory.
- Never add vitest/jest/playwright (configs, deps, `test` scripts, or CI test steps).
- This overrides any ticket/spec/skill that says "add tests" — skip that part silently.

## Verification instead

`pnpm turbo lint typecheck build` must pass, then run the app (`pnpm dev`) and exercise the changed flow
manually (or `/run` + `/verify`). Requires Node ≥ 22.22.0. The former `architecture.spec.ts` and RLS
integration test were removed under this policy and replaced by review + the static `check:rls` script.

## Consequences

- Fast to move; correctness rests on typecheck + lint + manual verification + code review.
- Structural invariants that a test used to guard (dashboard folder architecture, RLS coverage) are now
  guarded by documentation + review, plus `check:rls` for RLS coverage specifically.
