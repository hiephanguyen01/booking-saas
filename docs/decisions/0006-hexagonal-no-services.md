# ADR 0006 — Hexagonal backend, no service classes

**Status:** Accepted (documented 2026-07-17).

## Context

NestJS's default guidance funnels logic into `@Injectable` service classes. In a domain this size that
tends toward fat, catch-all services that mix orchestration, business rules, and data access, and blur
layer boundaries.

## Decision

Ports & Adapters with a fixed request flow — **`controller → use-case → repository-port →
repository`** — and **no service classes in the application layer**:

- **One use-case = one file**: a single exported `@Injectable XxxUseCase` with one public `execute()`.
- Controllers inject use-cases only (+ mappers/pipes, and exceptionally `TenantContextService`).
- Instead of a service, use: a **pure function in `domain/`** (computation), an **injectable use-case**
  (reusable operation needing ports), or a **port + infrastructure adapter** (technical capability).
- The only allowed `*.service.ts` are cross-cutting infra in `src/shared/*` and port-implementing
  adapters in `infrastructure/`.
- Domain code imports no framework (no Nest/Prisma). Dependencies point inward:
  infrastructure → application → domain.

## Consequences

- Small, single-responsibility units; business rules are framework-free and easy to locate.
- More files and more explicit wiring (ports/tokens in each module).
- Reviewers reject new `*.service.ts` in `application/`. See [`../../apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md).
