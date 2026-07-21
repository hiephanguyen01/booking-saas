# Storefront P0 hardening — 2026-07-21

## Scope

Storefront and shared frontend packages only. Dashboard and API implementation are intentionally unchanged.

## Changes in this branch

- Add a centralized strict `YYYY-MM-DD` validator.
- Reuse it in daily-range normalization and the booking-data resource loader.
- Invalid calendar dates such as `2026-02-31` now fall back safely instead of reaching `addDays()` and throwing a `RangeError`.

## Fixed-package availability verification

The API already computes each fixed daily package start date against the full package duration (`GetAvailabilityUseCase.fixedDaily`). Therefore the storefront's `openDates.has(range.from)` check is intentional: the returned status for the start date already represents availability for the whole package stay. No storefront change was made for this behavior.

## Repository policy

The repository currently has an explicit owner-level no-tests policy in `AGENTS.md` and ADR 0005. This branch does not reverse that policy. Verification remains lint, typecheck, build, and manual flow checks.
