# Axios Transport and Runtime Contract Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` and `superpowers:test-driven-development`
> task-by-task.

**Goal:** Replace the shared fetch client with Axios 1.18.1 while making the
client transport-only, cancellable, bounded by timeouts, and able to validate
successful responses with Zod.

**Architecture:** `@booking/api-client` creates isolated Axios instances from
explicit options. It attaches request-local cookie/scope headers without global
mutation, treats HTTP responses as values, maps network/timeout/invalid-response
failures, and rethrows cancellation. Refresh becomes an explicit auth endpoint;
the Dashboard root middleware remains its sole coordinator. Existing method
signatures stay compatible during incremental migration of 108 call sites.

**Tech Stack:** Axios 1.18.1, Zod 3.25, TypeScript, Vitest.

## Execution Status

**Transport foundation complete — 2026-07-14.** `@booking/api-client` now uses
isolated Axios instances and has no automatic 401 interceptor. It supports
request-local auth/scope headers, query data, JSON/FormData, timeout overrides,
`AbortSignal`, request ids, 204 responses, explicit failure categories, Zod
validation, cancellation propagation, and explicit login/refresh/logout auth
methods.

Dashboard authentication now performs the only permitted sequence:
`/auth/session` once, explicit refresh once only after 401, then one session
retry. Both session calls and refresh receive the navigation abort signal.
`/auth/session` and upload-presign responses are the first runtime-validated
endpoints.

Fresh verification:

- `@booking/api-client`: 1 test file / 5 tests; typecheck, lint, and dual CJS/ESM
  build passed.
- Dashboard: 4 test files / 17 tests; typecheck, lint, and production build
  passed.
- Storefront: 5 test files / 19 tests; typecheck, lint, and production build
  passed.
- `@booking/ui` typecheck and frozen-lockfile install passed.

The remaining endpoint groups intentionally retain the compatibility verb
surface. Their response schemas and request signals must be migrated feature by
feature; this is tracked work, not claimed as complete runtime validation.
Existing non-failing Vitest `EMFILE` and UI sourcemap diagnostics remain.

## Constraints

- No Axios singleton with mutable auth defaults.
- No automatic 401 interceptor or refresh token on ordinary request options.
- Preserve backend cookie authentication (`sid`/`rid`) server-to-server.
- Support `AbortSignal`, per-request/default timeout, query params, JSON,
  FormData, request id, and tenant/partner/affiliate scope headers.
- Successful response validation is opt-in per endpoint during migration.
- Invalid successful payloads return status 502 and never reach UI as typed data.
- HTTP, network, timeout, and invalid-response failures are distinguishable.
- Axios cancellation propagates instead of becoming a fake network failure.
- Keep React Router imports out of the shared package.

### Task 1: Add Failing Transport Contract Tests

**Files:**
- Create: `packages/api-client/src/client.spec.ts`
- Modify: `packages/api-client/package.json`

Test isolated headers, no refresh-on-401 behavior, query/signal/timeout forwarding,
204 handling, RFC7807 errors, failure categories, cancellation propagation, and
Zod success/invalid-response parsing.

### Task 2: Implement Axios Transport

**Files:**
- Replace: `packages/api-client/src/client.ts`
- Replace: `packages/api-client/src/errors.ts`
- Replace: `packages/api-client/src/types.ts`
- Replace: `packages/api-client/src/interceptor.ts`
- Modify: `packages/api-client/src/index.ts`
- Modify: `packages/api-client/package.json`
- Modify: `pnpm-lock.yaml`

Create one Axios instance per factory call, set `validateStatus`, normalize
headers and errors, add explicit login/refresh/session/logout methods, and keep
temporary verb compatibility overloads.

### Task 3: Move Dashboard Refresh to Explicit Coordination

**Files:**
- Modify: `apps/dashboard/app/lib/api.server.ts`
- Modify: `apps/dashboard/app/lib/auth-middleware.server.ts`
- Modify: `apps/dashboard/app/lib/auth-middleware.server.spec.ts`

On `/auth/session` 401, call explicit `/auth/refresh` once, retry session once,
then rotate Redis. Ordinary scoped API calls never receive refresh credentials.

### Task 4: Add Signal/Schema Migration Surface

**Files:**
- Modify: `apps/dashboard/app/lib/api.server.ts`
- Modify focused high-risk Dashboard callers
- Modify focused Storefront server callers where shared transport applies

Expose request options without breaking current routes. Migrate auth/session and
at least one representative scoped endpoint to `signal` plus Zod schema; leave
the remaining endpoint-group migration explicitly tracked.

### Task 5: Verify and Commit

Run package tests/typecheck/lint/build, both frontend tests/typecheck/lint/build,
frozen-lockfile install, cancellation scans, and `git diff --check`. Record the
known Vitest watcher and UI sourcemap diagnostics separately.

Commit boundaries:

```text
test(api-client): specify Axios transport behavior
refactor(api-client): replace fetch transport with Axios
refactor(dashboard): coordinate refresh explicitly in auth middleware
docs: record Axios transport verification
```
