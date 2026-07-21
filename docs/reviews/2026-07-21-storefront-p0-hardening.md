# Storefront P0/P1 hardening — 2026-07-21

## Scope

Storefront and shared frontend packages only. Dashboard and API implementation are intentionally unchanged.

## Changes in this branch

- Add a centralized strict `YYYY-MM-DD` validator and reject impossible calendar dates before date arithmetic.
- Validate hourly, daily, and inventory date query parameters before requesting availability.
- Serialize refresh-token rotation with a Redis lock scoped by storefront session ID.
- Re-read and reuse already-rotated sessions for concurrent requests.
- Sign affiliate attribution and visitor cookies with the storefront session secrets and enable `Secure` in secure environments.
- Validate signed referral codes against the API-generated `R-XXXXXX` format and visitor IDs as UUIDs.
- Remove tracking, booking, and catalog filter state from canonical and alternate URLs.
- Fetch every catalog page for every listing type when generating the tenant sitemap.
- Preserve query strings and use permanent 308 redirects for legacy routes.
- Bound the partner upload-presign backend call with a 10-second timeout.
- Include the selected booking start/end window when validating promotion eligibility.
- Replace raw backend booking/payment messages with localized storefront-safe failures while preserving known selection error codes.

## Fixed-package availability verification

The API already computes each fixed daily package start date against the full package duration (`GetAvailabilityUseCase.fixedDaily`). Therefore the storefront's start-date status check is intentional and was not changed.

## Compatibility note

Legacy unsigned affiliate and visitor cookies are intentionally rejected. A new signed visitor cookie is issued on the next referral visit, and attribution is restored after a valid `?ref=` click.

## Repository policy

The repository currently has an explicit owner-level no-tests policy in `AGENTS.md` and ADR 0005. Verification remains security check, lint, typecheck, build, Docker build, and manual flow checks.
