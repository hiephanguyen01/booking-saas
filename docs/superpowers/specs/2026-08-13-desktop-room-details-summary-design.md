# Desktop Room Details Summary Design

## Context

On listing-group pages, the desktop room table currently places the room heading and photos in the
first column, then immediately shows a “View details” disclosure. Although attribute data exists,
all of it is hidden in the collapsed disclosure, so the action appears before the user has seen any
useful room information.

## Approaches considered

1. **Show a compact attribute summary before the disclosure (selected).** Display up to four useful
   attributes in the collapsed state, then use the disclosure for the full attribute set and
   description. This improves scanability without making every table row excessively tall.
2. Expand all details by default. This exposes everything but creates very tall rows and makes room
   comparison difficult.
3. Remove the disclosure. This simplifies the row but makes secondary attributes and the room
   description inaccessible.

## Design

- Reuse the existing `RoomCompactSpecs` summary already used by the mobile/tablet room card.
- Pass that summary to `OfferingDetailsDisclosure` for the desktop table row as well.
- The collapsed state shows up to four attribute cards: area plus the first available configured
  attributes such as style, ceiling height, and equipment.
- “View details” remains below the summary and opens the complete attribute list and description.
- While expanded, the compact summary collapses so information is not duplicated.
- Rooms with a description but no attribute cards keep the existing disclosure behavior. Rooms with
  neither attributes nor a description continue to show the existing pending-information label.
- No API, loader, contract, i18n, pricing, booking, mobile, or tablet behavior changes.

## Verification

The repository forbids automated tests. Verify through the running storefront at desktop and mobile
breakpoints, then run the repository’s no-tests, structure, theme, security, lint, typecheck, build,
and RLS guards.
