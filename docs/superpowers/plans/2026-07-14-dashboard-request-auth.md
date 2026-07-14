# Dashboard Request-Scoped Auth and Opaque Session Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` and `superpowers:test-driven-development`
> task-by-task.

**Goal:** Validate and refresh Dashboard authentication exactly once per React
Router request, keep backend tokens out of browser cookies, and let all existing
loaders/actions consume one request-scoped auth result without touching
`apps/api` or the user's affiliate route edit.

**Architecture:** A root React Router middleware opens an `AsyncLocalStorage`
scope, resolves an opaque signed cookie through a Redis-backed session store,
calls `/auth/session` once, performs at most one refresh, and publishes the
result to guards. The middleware persists rotated tokens after `next()` and
coordinates logout so a destroyed session cannot be recreated. Existing guard
signatures remain temporarily compatible, allowing migration without editing
`apps/dashboard/app/routes/affiliate/_index.tsx`.

**Tech Stack:** React Router 8 middleware, Node `AsyncLocalStorage`, signed
cookies, Redis, Vitest, TypeScript.

## Constraints

- Preserve `apps/dashboard/app/routes/affiliate/_index.tsx` exactly as found.
- Do not modify `apps/api`.
- Browser cookie contains only a random opaque session id.
- Redis stores access token, refresh token, and user id with a bounded TTL.
- Missing/short session secrets fail closed; no public fallback secret.
- `/auth/session` and `/auth/refresh` run at most once per Dashboard request.
- Nested API calls receive access token only and cannot initiate refresh.
- Network/5xx auth failure returns 503 without deleting a valid session.
- Invalid/expired credentials clear the server record and browser cookie.
- Login POST is not allowed to have a stale middleware session overwrite its
  newly created session.

### Task 1: Specify Opaque Session Behavior with Failing Tests

**Files:**
- Create: `apps/dashboard/app/lib/session-store.server.spec.ts`
- Create: `apps/dashboard/app/lib/session-cookie.server.spec.ts`

1. Test parsing/validation of stored session records.
2. Test create/read/rotate/delete through an in-memory store contract.
3. Test that the serialized cookie does not contain access/refresh tokens.
4. Test that missing and short secrets throw.
5. Run focused tests and confirm RED before implementation.

### Task 2: Implement Redis Session Storage

**Files:**
- Create: `apps/dashboard/app/lib/session-store.server.ts`
- Replace: `apps/dashboard/app/lib/session.server.ts`
- Modify: `apps/dashboard/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`

1. Define a storage interface plus Redis and in-memory implementations.
2. Lazily create/connect one Redis client per Dashboard server process.
3. Store records under a Dashboard-specific prefix with seven-day TTL.
4. Use a signed `__dashboard_session` cookie containing a `randomUUID()` only.
5. Support current/previous signing secrets for rotation.
6. Keep `createUserSession` and `destroyUserSession` route APIs stable.

### Task 3: Specify Request Middleware with Failing Tests

**Files:**
- Create: `apps/dashboard/app/lib/request-auth.server.spec.ts`

1. Prove root and nested guard calls reuse one resolved auth context.
2. Prove a rotated token is written once after `next()`.
3. Prove logout suppresses the post-response rotation write.
4. Prove invalid credentials delete the session, while 5xx/network errors do
   not.
5. Prove login mutations bypass stale-session processing.

### Task 4: Implement Root Auth Middleware

**Files:**
- Create: `apps/dashboard/app/lib/request-auth.server.ts`
- Create: `apps/dashboard/app/lib/auth-middleware.server.ts`
- Modify: `apps/dashboard/app/root.tsx`
- Replace: `apps/dashboard/app/lib/auth.server.ts`
- Modify: `apps/dashboard/app/routes/auth/login.tsx`
- Modify: `apps/dashboard/app/routes/auth/logout.tsx`

1. Run `next()` inside `AsyncLocalStorage.run()` and expose typed helpers.
2. Load/validate `/auth/session` once with one refresh callback.
3. Append rotated/expired cookie effects after `next()`.
4. Have all guards read the current request scope instead of calling the API.
5. Make root/login loaders consume the same optional auth result.
6. Suppress middleware commit during logout.

### Task 5: Remove Nested Refresh Ownership

**Files:**
- Modify: `apps/dashboard/app/routes/admin/lib/api.server.ts`
- Modify: `apps/dashboard/app/routes/tenant/tenant.server.ts`
- Modify: `apps/dashboard/app/routes/partner/partner.server.ts`
- Modify: `apps/dashboard/app/routes/affiliate/affiliate.server.ts`
- Modify: `apps/dashboard/app/routes/uploads.presign.tsx`

1. Return access-token/scope descriptors without `refreshToken` or callbacks.
2. Keep `refreshedCookie()` as a temporary null-returning compatibility method
   so existing admin routes remain behaviorally stable.
3. Remove replay redirects and direct cookie mutation from nested helpers.
4. Pass request abort signals where current transport APIs permit it in the
   following Axios milestone.

### Task 6: Verify and Commit

Run fresh:

```bash
pnpm --filter @booking/dashboard test
pnpm --filter @booking/dashboard typecheck
pnpm --filter @booking/dashboard lint
pnpm --filter @booking/dashboard build
pnpm --filter @booking/storefront test
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront build
git diff --check
```

Also scan for nested refresh ownership and the old public secret fallback.
Record non-failing diagnostics separately.

Commit boundaries:

```text
test(dashboard): specify opaque session storage
feat(dashboard): store opaque sessions in Redis
test(dashboard): specify request-scoped authentication
refactor(dashboard): centralize authentication in root middleware
fix(dashboard): remove nested token refresh ownership
docs: record Dashboard auth verification
```

After this milestone, replace the fetch transport with Axios. Axios must only
send requests, time out/cancel them, and validate responses; this middleware
remains the sole owner of refresh-token coordination.
