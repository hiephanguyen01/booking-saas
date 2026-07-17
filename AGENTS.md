# AGENTS.md — Bookify: Booking SaaS + Marketplace

**All conventions live in [`CLAUDE.md`](./CLAUDE.md) — read that file in full before writing any
code.** This file exists only to redirect non-Claude tools (Codex, Cursor, Gemini CLI, …) there;
everything in `CLAUDE.md` applies to every agent verbatim (skill invocations only apply to agents
that have those skills).

The three hard rules — repeated here so no agent can miss them; they OVERRIDE anything else in
this repo (specs, tickets, skills, older doc snippets):

1. **NO TESTS — ever.** This repo deliberately ships **zero tests**. Never create `*.spec.ts(x)` /
   `*.test.ts(x)` / e2e tests; never add vitest/jest/playwright configs, `test` scripts, test
   dependencies, or CI test steps — even when a ticket, spec excerpt, or skill tells you to write
   tests. Verification = `pnpm typecheck` + `pnpm lint` + `pnpm build` + running the app and
   exercising the changed flow.
2. **Backend flow is `controller → use-case → repository port → repository`.** **No service
   classes** in the application layer — see `CLAUDE.md` §5 for the exact rules and the sanctioned
   alternatives (use-case / pure domain function / port + infrastructure adapter). The only allowed
   `*.service.ts` files are cross-cutting infrastructure in `src/shared/*` and port-implementing
   adapters in `infrastructure/`.
3. **One use-case = one file.** Exactly one exported `@Injectable` `XxxUseCase` class per file,
   with a single public `execute()` method.

Product/design spec: [`phases/core.md`](./phases/core.md) (EN) / `phases/core.vi.md` (VI).
Ticket-by-ticket plan: [`docs/superpowers/plans/booking-saas-tasks/`](./docs/superpowers/plans/booking-saas-tasks/).
When docs disagree on product behaviour, `phases/core.md` wins; on code structure, `CLAUDE.md` wins.
