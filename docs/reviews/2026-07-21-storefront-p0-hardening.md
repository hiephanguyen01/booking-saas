# Storefront P0/P1/P2/P3 hardening — 2026-07-21

## Scope

Storefront and shared frontend packages only. Dashboard and API implementation are intentionally unchanged.

## Changes in this branch

- Add a centralized strict `YYYY-MM-DD` validator and reject impossible calendar dates before date arithmetic.
- Reject date-only inputs whose required day offset would leave the four-digit `YYYY-MM-DD` contract.
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
- Add conservative response security headers, including a non-breaking CSP, framing protection, permissions policy, referrer policy, MIME sniffing protection, and production HSTS.
- Remove the silent 20-room listing-group cap and bound child-detail fan-out to four concurrent tasks.
- Bound fixed-package availability fan-out to three concurrent tasks and scope related-listing lookup to the current listing type.
- Reuse strict calendar validation in the shared storefront search-state parser.
- Build catalog API queries from an allowlist instead of forwarding arbitrary browser parameters.
- Bound and validate dynamic `attr.*` filters before forwarding them through the BFF.
- Sign the recent-bookings cookie and accept only API-generated `BK-XXXXXX` booking codes.
- Suppress raw booking lookup failures and prevent development OTP hints from being serialized in production.
- Sanitize every structured Storefront API result before it can enter loader/action hydration data.
- Preserve only bounded `UPPER_SNAKE_CASE` problem codes and field-error codes; replace free-form backend messages with localized generic failures.
- Limit backend field-error payloads to 50 valid field names and five messages per field.

## Fixed-package availability verification

The API already computes each fixed daily package start date against the full package duration (`GetAvailabilityUseCase.fixedDaily`). Therefore the storefront's start-date status check is intentional and was not changed.

## Compatibility note

Legacy unsigned affiliate, visitor, and recent-bookings cookies are intentionally rejected. New signed cookies are issued through the corresponding storefront flows; attribution is restored after a valid `?ref=` click, and recent bookings are repopulated after the next booking created on the device.

## Repository policy

The repository currently has an explicit owner-level no-tests policy in `AGENTS.md` and ADR 0005. Verification remains security check, lint, typecheck, build, Docker build, and manual flow checks.
