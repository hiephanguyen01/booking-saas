# Demo booking history and home carousel seed

## Goal

Make the StudioHub demo account useful for visually checking every booking-history tab and the
storefront home carousel after a normal `seed` + `storage:init` setup. The customer remains
`customer@studiohub.vn`; no production schema, API, or storefront contract changes are required.

## Booking fixtures

- Cover the five UI variants behind the six history tabs: `pending_payment`, `confirmed`,
  `completed`, `cancelled`, and `no_show`; the `all` tab is their aggregate.
- Reuse the existing health fixtures for `confirmed` and `completed` where possible, then add stable
  seed fixtures for the missing states. Keep `BK-HEALTH03` because platform-health metrics already
  depend on it.
- Generalize the seed booking helper to accept the required statuses and state-specific monetary
  fields. Each fixture has a stable code and idempotency key, and reruns update the existing row
  instead of inserting duplicates.
- Recompute relative timestamps on every run: payment and confirmed bookings stay in the future;
  completed and no-show bookings stay in the past; cancelled remains terminal. Future blocking
  ranges do not overlap on the primary Studio resource.
- Populate realistic immutable snapshots (`pricingSnapshot`, cancellation policy and customer note),
  paid/deposit/refund amounts, expiry where applicable, and one deterministic status-history chain
  per fixture. Existing reviewed completed booking and review remain intact.
- Replace only status-history rows belonging to these known seed fixtures. Do not touch user-created
  bookings or unrelated demo data.

## Carousel assets

- Add the four supplied JPEGs as optimized repository assets under the existing
  `booking-studio` defaults. Preserve their order (`img1` through `img4`) and downsize/compress them
  for web delivery without changing their visible composition; the existing carousel's
  `object-cover` remains responsible for responsive cropping.
- Extend `storage:init` to upload them idempotently to
  `defaults/booking-studio/carousel/01.jpg` through `04.jpg` with `image/jpeg` and the existing
  public-cache policy.
- Set StudioHub's `themeConfig.carousel` to the four corresponding `S3_PUBLIC_URL` URLs. Do not use
  local Downloads paths or hard-code `localhost`; other tenants and listing photos are unchanged.

## Verification

- Do not add test files per repository policy.
- Run API `typecheck`, `lint`, and `build`; run `prisma:generate` only if types require it (no schema
  change is planned).
- With local infrastructure available, run `storage:init` and `seed` twice to confirm idempotency,
  then inspect the customer booking tabs and home carousel in Vietnamese and English.
- Confirm the second seed produces no duplicate codes/history rows, upcoming times remain future,
  blocking ranges do not conflict, all four carousel objects load, and existing platform-health
  fixtures still contribute to health metrics.

## Assumptions

- The supplied images are authorized for inclusion in this demo repository.
- Seed data is development/demo-only and may refresh its deterministic fixture timestamps on rerun.
- Booking coverage targets UI variants, not all ten backend status enum values.
