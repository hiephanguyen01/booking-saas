# Storefront P0 hardening — 2026-07-21

## Scope

Storefront and shared frontend packages only. Dashboard and API implementation are intentionally unchanged.

## Changes in this branch

- Add a centralized strict `YYYY-MM-DD` validator.
- Reuse it in daily-range normalization, booking-data resource loading, and the listing route.
- Reject impossible calendar dates such as `2026-02-31` before they reach `addDays()` or timezone conversion helpers.
- Validate hourly, daily, and inventory date query parameters before requesting availability.
- Serialize refresh-token rotation with a short-lived Redis lock scoped by storefront session ID.
- Re-read the latest session after acquiring the lock so concurrent requests reuse already-rotated tokens instead of refreshing with an invalidated token.
- Persist rotated tokens while the lock is held and release the lock with an atomic compare-and-delete Lua command.

## Fixed-package availability verification

The API already computes each fixed daily package start date against the full package duration (`GetAvailabilityUseCase.fixedDaily`). Therefore the storefront's `openDates.has(range.from)` check is intentional: the returned status for the start date already represents availability for the whole package stay. No storefront change was made for this behavior.

## Repository policy

The repository currently has an explicit owner-level no-tests policy in `AGENTS.md` and ADR 0005. This branch does not reverse that policy. Verification remains lint, typecheck, build, and manual flow checks.
