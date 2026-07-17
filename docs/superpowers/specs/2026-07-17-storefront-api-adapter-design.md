# Storefront Unified API Adapter Design

**Date:** 2026-07-17

## Goal

Give the storefront one typed server-to-server HTTP boundary. Every ordinary API response consumed by the storefront is validated with an existing `@booking/contracts` schema before application code receives it, while preserving current routes, statuses, cookies, tenant forwarding, and user-facing behavior.

This batch may extend `packages/api-client` additively. It must not modify `apps/dashboard`, `apps/api`, database code, public contracts, or shared UI.

## Current problem

The storefront currently reaches the backend through several independent transports:

- `app/lib/api.server.ts` wraps `@booking/api-client` for some authenticated calls.
- `public-api.server.ts` performs generic public GET requests and trusts JSON through a type assertion.
- `booking.server.ts` has its own POST transport and its own `ApiResult` shape.
- tenant, affiliate, partner onboarding, upload, and operational code contain additional direct backend calls.

These paths differ in timeout handling, error normalization, host forwarding, authentication, and runtime response validation. A malformed successful backend response can therefore enter storefront route code as if it matched the TypeScript type.

## Package API changes

Extend `@booking/api-client` without changing any existing method signature:

- Add `publicGet<T>(path, options)` using the same `ApiRequestOptions<T>` and `ApiResult<T>` types as the existing methods.
- Add `register(credentials)` for `/auth/register`, accepting `email`, `password`, `fullName`, optional `phone`, and optional `locale`.
- Generalize the internal unauthenticated request helper so public GET and POST share query, signal, timeout, header, request-id, schema validation, and transport-error behavior.
- Introduce `BackendAuthResult` for the shared token/user success shape. Export `BackendLoginResult` and `BackendRegisterResult` as aliases so existing login consumers remain source-compatible and registration has an explicit public return type.

`register()` must parse the opaque `sid` and `rid` response cookies exactly as `login()` does. A 2xx response missing either cookie or the expected user identity is an invalid backend response and returns status `502` with failure `invalid-response`.

The extension is additive, so dashboard source code and existing api-client consumers require no migration.

## Storefront adapter

`apps/storefront/app/lib/api.server.ts` becomes the sole ordinary HTTP adapter for storefront features and routes. It owns the storefront-specific policy layered on top of `@booking/api-client`:

- Forward the incoming request's effective host using the existing `x-forwarded-host` convention.
- Forward the request `AbortSignal`.
- Attach the current opaque access token and scope metadata when authentication is required or available.
- Accept a Zod schema from `@booking/contracts` for every JSON success response.
- Preserve backend status, error code, field errors, and request id for action-level error handling.
- Convert transport failures consistently: timeout to `504`, network/backend unavailability to `503`, and invalid successful response data to `502`.

The adapter exposes explicit public, authenticated, and optional-auth operations. Optional-auth operations select the authenticated api-client method only when the current request context contains a valid access token; they do not perform a second session lookup.

Feature code receives parsed data or a normalized `ApiResult`; it never performs `response.json()` or asserts an unvalidated payload type.

## Migration boundaries

Migrate all ordinary storefront backend traffic in this batch:

- Tenant host resolution.
- Catalog, listing, availability, quote, promotion, booking, payment, and checkout calls.
- Affiliate referral tracking and application flows.
- Partner registration, login, and onboarding application flows.

Delete `public-api.server.ts`, the booking-local POST helper, and the booking-local `ApiResult` definition once their consumers use the unified adapter.

Two narrowly defined direct-transport exceptions remain:

- `/readyz`, because it is an operational dependency probe that deliberately bypasses tenant/session request context.
- Upload/presign proxy code, because it transfers or proxies a non-standard payload rather than acting as an ordinary JSON API consumer.

The security architecture script will allow direct `fetch()` only in `app/routes/readyz.ts` and `app/routes/uploads.presign.tsx`. It will reject new direct backend fetches elsewhere in `apps/storefront` with an error directing developers to `app/lib/api.server.ts`.

## Runtime validation

Use existing schemas exported by `@booking/contracts`; do not redeclare response schemas inside the storefront. Arrays and envelopes may be composed from those exports with Zod where the backend response shape requires it, but the domain object definitions remain contract-owned.

Each migrated call supplies its matching schema, including tenant, catalog/listing, availability, quote, booking, payment, promotion, affiliate, and auth-related payloads. A successful HTTP response that fails parsing is treated as an upstream contract violation, not as valid partial data.

No schema fallback may silently return the unparsed response.

## Error semantics

Read flows preserve existing route behavior:

- A documented optional-resource `404` remains nullable where the current route treats absence as normal.
- Other backend `4xx` statuses retain their current route-level handling.
- Backend `5xx` and network failures surface as storefront `503` unless a more specific existing status is required.
- Timeouts surface as `504`.
- Invalid successful response bodies surface as `502`.

Mutation flows preserve backend status, error code, and field errors so existing translated form feedback continues to work. Raw backend error messages are not newly exposed to users.

Referral attribution remains fail-soft: tracking failure must not block browsing or checkout. Its response is still validated when present, and failure remains observable through the existing server-side logging path.

## Security and tenancy invariants

- Browser code never calls the backend directly.
- Tenant resolution remains request-scoped and occurs once in middleware.
- The adapter forwards host and auth data from the current request; it does not introduce cross-request mutable state or caching.
- Auth refresh, invalid-session destruction, session commit suppression, checkout-flow cookies, idempotency, and payment redirect allowlisting remain unchanged.
- API endpoint paths, payloads, response envelopes, and public contracts remain unchanged.

## Static architecture gate

Extend `scripts/architecture/check-storefront-security.mjs` to detect direct `fetch()` usage under `apps/storefront`.

The gate permits only `app/routes/readyz.ts` and `app/routes/uploads.presign.tsx`. For every other violation it prints the source file and instructs the developer to use the unified storefront API adapter. Existing tenant-resolution, CSRF, cookie, redirect, and operational-path checks remain intact.

## Verification

Per ADR 0005, do not add test files, test configuration, test scripts, or CI test steps.

Run:

- `pnpm --filter=@booking/api-client lint`
- `pnpm --filter=@booking/api-client typecheck`
- `pnpm --filter=@booking/api-client build`
- `pnpm --filter=@booking/storefront lint`
- `pnpm --filter=@booking/storefront typecheck`
- `pnpm --filter=@booking/storefront security`
- `pnpm --filter=@booking/storefront build`

Perform static checks:

- Confirm no storefront import of `public-api.server.ts` remains and delete the file.
- Confirm ordinary direct `fetch()` calls remain only in the allowlisted operational/upload files.
- Temporarily introduce a direct fetch in a non-allowlisted storefront server file, confirm the security gate fails with the expected guidance, then revert the temporary edit.

Run the local app and manually verify:

- Valid hosts render catalog and listing pages in Vietnamese and English.
- Unknown and unavailable tenant responses preserve `404` and `503` behavior.
- Anonymous and authenticated listing/availability/quote flows work.
- Guest and authenticated checkout still create bookings and redirect correctly.
- Login, registration, affiliate, and partner onboarding preserve cookies and form errors.
- Referral tracking failures do not block navigation or checkout.
- `/healthz` and `/readyz` continue to work without tenant/session resolution.
- Upload/presign behavior remains functional.

## Out of scope

- Changes to dashboard or API source code.
- New contracts, endpoints, database changes, migrations, or UI redesign.
- Tenant caching or other cross-request state.
- Observability redesign beyond preserving existing request ids and logging.
- Removal or redesign of the upload proxy transport.
