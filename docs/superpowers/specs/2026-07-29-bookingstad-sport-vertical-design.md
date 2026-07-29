# BookingStad Sport Vertical Design

## Problem

BookingStad is intentionally seeded with `vertical: "sport"`, but the shared
`verticalSchema` only accepts `studio`, `rental`, and `classes`. The API returns a
valid tenant payload that the Storefront rejects as an invalid response, so every
BookingStad route fails at the root loader.

The sport catalog seed also stores unsupported search controls (`chips`,
`toggle`) and malformed numeric buckets. The catalog repository validates this
JSON on read and throws, causing `GET /public/listing-types` to return 500 and the
Storefront to surface 503.

## Design

Treat `sport` as a first-class tenant vertical in the shared contract. Update the
Dashboard's explicit vertical collections and Vietnamese labels so creation,
filtering, and settings screens remain consistent with the contract. Keep the
Storefront's existing Phase 1 behavior: all non-studio verticals, including
`sport`, use the current studio home template until a dedicated template exists.

Normalize sport facets to the controls the Storefront implements: select and
boolean attributes use `checkbox`, while ceiling height uses `range`. Parse the
sport search config through the shared schema during seeding so invalid fixture
data fails before it can be persisted. Rerun the idempotent seed to repair the
existing local rows.

Add the sport listing and attribute glyphs used by the seed to the curated shared
Lucide allowlist, with exhaustive Vietnamese Dashboard labels. This keeps public
response validation and the tenant icon editor aligned with the seeded catalog.
The allowlist includes `ListChecks`, which appears only in full listing details
because the corresponding facilities attribute is display-only, not filterable.

Do not change seeded tenant data or database rows. Do not add tests, in accordance
with ADR 0005. Verify with contract parsing, static checks, builds, and a request to
the original BookingStad URL.
