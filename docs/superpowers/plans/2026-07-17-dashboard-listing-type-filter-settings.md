# Dashboard Listing-Type Filter Settings — Implementation Plan

**Status:** Implemented — 2026-07-17

**Goal:** Allow a tenant admin to configure the Storefront search schedule and every supported filter for each listing type from Dashboard, using the `searchConfig` already persisted by the API.

**Architecture:** Keep filter settings inside the existing listing-type create/edit form because `searchConfig.attributeFacets` depends directly on `attributeSchema`. Submit both structures atomically through the existing listing-type create/PATCH endpoints. The shared contracts and API remain the validation boundary; Dashboard provides a constrained editor that cannot generate incompatible facet configurations.

**Scope note:** `ListingType.searchConfig` already exists as JSONB, is included in listing-type responses, and is accepted by create/update. This work needs no new database column, migration, NestJS module, permission, or public API endpoint.

## Current state and gaps

- `packages/contracts/src/contracts/listing-type.ts` already defines:
  - `schedule: none | hourly | daily | inventory`
  - `showGuests`
  - ordered `systemFacets`: `price | location | amenities`
  - ordered `attributeFacets`
  - facet controls: `checkbox | radio | range | buckets`
  - `matchAll` and numeric bucket definitions
- `apps/api` already stores and returns `searchConfig`, and validates that its schedule is enabled and its attribute keys are filterable.
- `apps/dashboard/app/routes/tenant/components/listing-type-form.tsx` does not put `searchConfig` into default values, render it, or include it in the transformed payload.
- The Dashboard currently says every “Lọc được” attribute becomes a Storefront filter. That is incomplete: it must also be enabled and configured in `searchConfig.attributeFacets`.
- API validation is duplicated between create/update and does not yet enforce control compatibility with attribute types.

## Product and UX decisions

### Placement

Add a **“Tìm kiếm & bộ lọc Storefront”** section to the existing listing-type form, after “Thuộc tính tuỳ biến”. Do not create a separate settings route in the first version.

Reasons:

- An attribute and its facet configuration can be created or changed in one save.
- Removing or changing an attribute can update dependent facet settings immediately.
- New listing types can be fully configured before their first save.
- The existing `POST/PATCH tenant/listing-types` APIs already support the complete payload.

The long form should use clear bordered sections and subheadings. Do not introduce a new drag-and-drop dependency; use accessible Move up/Move down buttons for ordering.

### Search settings

The section contains:

1. **Lịch tìm kiếm**
   - Select: Không dùng lịch / Theo ngày / Theo khoảng ngày / Theo khoảng thuê kho.
   - Only show schedules compatible with `allowedModes`:
     - `hourly` → Theo ngày
     - `daily` → Theo khoảng ngày
     - `inventory` → Theo khoảng thuê kho
   - `appointment` and `class` remain `none` until their search engines exist.
   - If an admin disables the booking mode currently used by the schedule, reset schedule to `none` and show an inline explanation.

2. **Số khách**
   - Switch backed by `showGuests`.
   - Explain that it filters against listing capacity.

3. **Bộ lọc hệ thống**
   - Enable/disable Price, Location, and Amenities.
   - Preserve array order and update the API facet composer to honor it; the current API checks `includes()` in a fixed price/location/amenities order.
   - Provide Move up/Move down controls.

4. **Bộ lọc thuộc tính**
   - Source options only from `attributeSchema` rows with `filterable=true`.
   - Each filter row shows attribute label, key, type, enabled state, control, and applicable advanced settings.
   - Preserve `attributeFacets` order and expose Move up/Move down controls.

### Allowed control matrix

| Attribute type | Allowed controls | Advanced setting |
| --- | --- | --- |
| `boolean` | Checkbox, Radio | None |
| `select` | Checkbox, Radio | None |
| `multiselect` | Checkbox | `matchAll`: require every selected value instead of any value |
| `number` | Range, Buckets | Bucket editor for `buckets` |
| `text` | Checkbox, Radio | Show a warning that this is suitable only for bounded/repeated values |

Defaults when enabling a facet:

- boolean/select/multiselect/text → `checkbox`
- number → `range`
- `matchAll=false`
- no buckets unless `control=buckets`

### Numeric bucket editor

For a numeric facet using `buckets`, each ordered row contains:

- Stable ID/slug
- Customer-facing label
- Optional minimum
- Optional maximum
- Move up/down and remove actions

Validation:

- At least one bound is required.
- If both exist, `min < max`.
- IDs are unique within the facet.
- Buckets must not overlap; touching half-open boundaries are allowed (`previous.max === next.min`).
- At least one bucket is required before save.

### Dependency behaviour

- Renaming an attribute key updates the matching facet key in the same form state.
- Turning off “Lọc được” or deleting an attribute that has an enabled facet asks for confirmation, then removes that facet configuration.
- Changing an attribute type resets an incompatible control to its default and removes obsolete `buckets`/`matchAll` values.
- Disabling a facet removes it from `attributeFacets`; it must not leave a hidden stale configuration in the payload.
- Existing saved configuration is preserved exactly when the admin edits unrelated listing-type fields.

## Task 1: Centralize and strengthen search-config validation

**Files:**

- Modify `packages/contracts/src/contracts/listing-type.ts`
- Create `apps/api/src/modules/catalog/application/services/listing-type-search-config.validator.ts`
- Modify `apps/api/src/modules/catalog/application/use-cases/create-listing-type.use-case.ts`
- Modify `apps/api/src/modules/catalog/application/use-cases/update-listing-type.use-case.ts`
- Modify `apps/api/src/modules/catalog/application/use-cases/search-public-catalog.use-case.ts`

Implementation:

- Keep structural validation in the shared Zod schemas: unique facet keys, bucket shape, unique bucket IDs, and valid bounds.
- Add one pure API validator for rules that require the merged listing-type state:
  - schedule must exist in `allowedModes` unless it is `none`
  - every configured facet key exists and is `filterable`
  - control is compatible with attribute type according to the matrix above
  - `matchAll` is allowed only for multiselect checkbox facets
  - buckets target a number attribute, exist only for `control=buckets`, and do not overlap
- Call the same validator from create and update. Update must validate `input + existing` after merging partial fields.
- Return stable 400 codes/messages (`INVALID_SEARCH_SCHEDULE`, `INVALID_SEARCH_FACET`, `INVALID_SEARCH_BUCKETS`) without leaking storage errors.
- Remove the duplicated inline validation from the two use cases after the shared validator is wired.
- Change public facet composition to iterate `searchConfig.systemFacets` in saved order, then `attributeFacets` in saved order. This version does not support interleaving system and attribute facets.

## Task 2: Include `searchConfig` in listing-type form state

**Files:**

- Modify `apps/dashboard/app/routes/tenant/components/listing-type-form.tsx`
- Modify `apps/dashboard/app/routes/tenant/listing-types/new.tsx` only if action error mapping needs deeper nested errors
- Modify `apps/dashboard/app/routes/tenant/listing-types/edit.tsx` only if action error mapping needs deeper nested errors

Implementation:

- Add `searchConfig` to `listingTypeFormDefaultValues()`:
  - edit: use the API response unchanged
  - create: parse `{}` with `listingTypeSearchConfigSchema` so defaults are explicit and stable
- Include a normalized `searchConfig` in the GenericForm transform.
- Strip settings that are not applicable:
  - omit buckets for non-bucket controls
  - force `matchAll=false` except for multiselect checkbox facets
  - remove facets that no longer reference a filterable attribute
- Do not infer a schedule silently for new types; default to `none` and let the admin opt in.
- Keep create/update submissions as one JSON request through the existing Dashboard BFF helpers.

## Task 3: Build the Dashboard filter-settings editor

**Files:**

- Create `apps/dashboard/app/routes/tenant/components/listing-type-search-config-fields.tsx`
- Modify `apps/dashboard/app/routes/tenant/components/listing-type-form.tsx`
- Reuse existing components from `@booking/ui`; add a shared primitive only if the registry/package does not already contain it

Implementation:

- Bind the editor to the existing react-hook-form instance using `Controller`/`useWatch`.
- Split the UI into focused components:
  - `SearchScheduleFields`
  - `SystemFacetEditor`
  - `AttributeFacetEditor`
  - `NumericBucketEditor`
- Derive compatible schedule choices from live `allowedModes`.
- Derive available attribute facets from live `attributeSchema`.
- Prevent duplicate facet rows.
- Use buttons with explicit accessible labels for reorder/remove actions.
- Render nested validation errors beside the exact schedule, facet, or bucket row; also retain a section-level error summary.
- Update the current “Lọc được” description so it explains that the attribute becomes eligible and must be enabled below.

## Task 4: Synchronize attribute edits with facet settings

**Files:**

- Modify `apps/dashboard/app/routes/tenant/components/listing-type-form.tsx`
- Modify `apps/dashboard/app/routes/tenant/components/listing-type-search-config-fields.tsx`

Implementation:

- Add small form-state helpers for:
  - rename facet key
  - remove facet by attribute key
  - normalize facet after attribute type change
  - reset schedule after allowed-mode removal
- Invoke those helpers from the existing attribute key/type/filterable/delete controls.
- Require confirmation only when an action removes active filter configuration; ordinary edits remain immediate.
- Ensure cancellation leaves both attribute and filter configuration unchanged.
- Use stable UI row IDs generated locally for React rendering; never persist those IDs into the API payload. Do not use array index as the long-lived editor identity after reorder is introduced.

## Task 5: Add listing-type filter summary to the Dashboard list

**Files:**

- Modify `apps/dashboard/app/routes/tenant/listing-types/_index.tsx`
- Modify `apps/dashboard/app/lib/format.ts` if schedule labels are shared elsewhere

Implementation:

- Add a compact “Tìm kiếm” column showing:
  - schedule label
  - number of enabled system + attribute facets
  - whether guest filtering is enabled
- Keep the existing Edit action as the entry point; do not add a second settings route.
- For read-only admins, show the summary but retain the existing permission gate on editing.

## Task 6: Manual verification and quality checks

Per the earlier request, do not add new unit/integration test files for this feature. Update no unrelated tests. Verify through type-check, lint, build, contract parsing, and local Dashboard/Storefront flows.

Run:

```bash
pnpm --filter @booking/contracts build
pnpm --filter @booking/api typecheck
pnpm --filter @booking/api lint
pnpm --filter @booking/dashboard typecheck
pnpm --filter @booking/dashboard lint
pnpm --filter @booking/dashboard build
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront lint
git diff --check
```

Manual scenarios:

1. **Studio:** hourly schedule, guests enabled, system facets reordered, area buckets edited, style checkbox, natural-light boolean.
2. **Equipment:** inventory schedule, brand text checkbox, condition checkbox, insurance boolean; confirm Storefront shows friendly Có/Không labels.
3. **Costume:** multiselect size with `matchAll` toggled and persisted.
4. **Model:** schedule remains `none`; height uses buckets; unsupported appointment schedule is not offered.
5. Save, reload Dashboard edit, and confirm every value and ordering survives.
6. Open the corresponding Storefront type page and confirm the rendered filter order/control matches the saved config immediately.
7. Remove “Lọc được” from an active attribute, accept confirmation, save, and confirm the Storefront facet disappears without API 400/500.
8. Disable the active schedule's booking mode and confirm it resets to `none` before save.
9. Verify a user with `tenant.listings.read` but without `tenant.listings.write` cannot mutate settings.

## Acceptance criteria

- Tenant admins can configure schedule, guest visibility, system facets, attribute facets, control type, match semantics, buckets, and display order per listing type.
- Storefront respects the saved order within the system-facet group and within the attribute-facet group.
- Dashboard cannot produce a facet configuration incompatible with its attribute type or allowed booking modes.
- Create/edit saves `attributeSchema` and `searchConfig` atomically through existing tenant-scoped APIs.
- Editing unrelated listing-type data does not erase existing filter settings.
- Removing/renaming/changing an attribute cannot leave a dangling facet.
- Reloading the Dashboard reproduces the saved editor state exactly.
- Storefront reflects saved settings without hard-coded category behaviour.
- No database migration or new endpoint is introduced.
- Rating filters, rating sorting, promotion sorting, appointment availability, and class availability remain out of scope.

## Recommended follow-up after the first version

Add a read-only Storefront preview panel beside the editor that renders control labels/order from the current unsaved configuration. It should not fetch facet counts or results; those remain data-dependent and authoritative only on the real Storefront search response.
