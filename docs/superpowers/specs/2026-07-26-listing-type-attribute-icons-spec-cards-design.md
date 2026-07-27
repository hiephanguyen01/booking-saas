# Listing-type attributes: per-attribute icons, spec cards, and filter icons

**Date:** 2026-07-26
**Status:** Approved design, ready for implementation plan

## Problem

A tenant's service posts (packages / listing children) carry rich, structured
information — the reference screenshots show a photography package with cards like
*Thợ chụp* (photographers), *Thiết bị sử dụng* (equipment), *Trang điểm* (makeup),
*Làm tóc* (hair), *Trang phục* (costume), *Phụ kiện* (accessories), *Hậu kì*
(post-production), *Ưu đãi khác* (offers), *Không bao gồm* (not included). Each card
is **an icon + a title + either a single value or a bullet list of values**.

BookingOS already lets tenants define custom attributes per listing type
(`ListingType.attributeSchema`) and expose them as storefront search facets
(`ListingType.searchConfig`). Three things are missing:

1. **Per-attribute icons.** `attributeFieldSchema` has no `icon` field, so attributes
   render with position-based icons (`attributeIcon(index)` → Ruler / Image / Sparkles)
   rather than a tenant-chosen icon.
2. **An icon-picker UI.** The dashboard has no lucide icon picker at all. The
   `LISTING_TYPE_ICONS` allowlist and a promised `ICON_LABEL` map exist in intent
   (see the comment at `listing-type.ts:23`) but the map is missing and the listing
   type's own `icon` column is unreachable from the form (only image upload exists).
3. **A data home for bullet-list values.** Current attributes are flat `key → scalar`
   values, rendered as `label: value` rows. There is no attribute type that holds the
   descriptive bullet lists the screenshots show.

## Goal

Let a tenant configure, **per listing type**, custom attributes that each carry a
tenant-chosen icon; render those attributes as icon-led "spec cards" (icon + title +
bullet list) on the storefront listing detail, and render the icon next to each
attribute filter in the storefront catalog. Filterable, structured attributes keep
powering search facets exactly as today — now with icons.

## Non-goals

- No new bounded context, controller, service class, or endpoint.
- **No database migration.** All changes ride existing JSON columns
  (`attribute_schema`, `attributes`, `search_config`) and existing response schemas.
- No change to how facets are computed or how listings are searched, beyond
  attaching an icon to each facet.
- No uploaded/custom image per attribute — attribute icons come only from the shared
  lucide allowlist (per the "choose from an icon set" requirement).

## Key decisions

- **`list` attributes are display-only.** A `list`-type attribute cannot be
  `filterable`; it never produces a search facet. Free-text bullet lists are
  descriptive, not filter dimensions. Enforced in the contract.
- **One lucide allowlist for both** listing-type icons and attribute icons. Reuse and
  grow `LISTING_TYPE_ICONS`; build one reusable `IconPicker`.
- **Additive and migration-free** — `attributeSchema` / `attributes` / `searchConfig`
  are JSON, and `publicListingTypeResponseSchema` already embeds `attributeFieldSchema`,
  so a new `icon` field on an attribute propagates end-to-end with no schema change.

## Design

### 1. Contract (`packages/contracts/src/contracts/listing-type.ts`)

- **`attributeFieldSchema`** (currently line ~126): add
  `icon: listingTypeIconSchema.optional()`. Add a `superRefine` rule: a field of type
  `list` must have `filterable === false` (reject otherwise with a clear message).
- **`attributeFieldTypeSchema`** (line ~116): add `'list'` →
  `['text', 'number', 'select', 'multiselect', 'boolean', 'list']`. A `list` value is
  a `string[]`.
- **`LISTING_TYPE_ICONS`** (line ~28): grow the allowlist to cover the screenshot
  cards — e.g. `Users`, `Camera`, `Sparkles`, `Scissors`, `Shirt`, `Gift`, `MapPin`,
  `Images`, `CircleSlash` (not-included). Add the **`ICON_LABEL`** map the code comment
  already references (lucide name → Vietnamese display label), used by the picker.
- **`publicCatalogFacetSchema`** (in `catalog-search.ts`, line ~201): add
  `icon: z.string().nullable().default(null)` so the storefront filter can show the
  attribute's icon per facet.

Because `attributeSchema` is JSON and validated identically on FE + BE, and the
listing's `attributes` JSON is validated against the type's schema at write time, the
`list` type and the `icon` field require no migration and no new validation surface
beyond these schema edits.

Rebuild after editing: `pnpm --filter=@booking/contracts build`.

### 2. Reusable `IconPicker` (dashboard `app/components/icon-picker.tsx`)

A popover with a searchable grid of the allowlisted lucide icons. Renders each icon via
the same dynamic `import * as Icons from 'lucide-react'` lookup used by
`app/components/listing-type-icon.tsx`; labels come from `ICON_LABEL`; search filters by
label and by icon name. Value is a lucide icon **name** (`string | undefined`). Used by
two call sites (below). This closes the existing gap where the listing type's `icon`
field cannot be set from the UI.

### 3. Dashboard config UI

- **`features/tenant/components/listing-type-attribute-fields.tsx`**:
  - Add an `IconPicker` control to each attribute row, bound to `row.icon`, threaded
    through the existing `update(i, patch)` path.
  - Add `list` to `FIELD_TYPES` and to `ATTRIBUTE_FIELD_TYPE_LABEL` in
    `features/tenant/constants.ts`.
  - When the selected type is `list`, force `filterable = false` and hide the "Lọc
    được" checkbox (mirrors the contract rule). Keep the existing `searchConfig`
    re-normalization on key rename / filterable-off / remove.
- **`features/tenant/components/listing-type-form.tsx`**: add the `IconPicker` for the
  listing type's own `icon`, alongside the existing `iconImageUrl` upload
  (`iconImageUrl` still takes precedence when set — unchanged).

### 4. Partner listing form (attribute values)

When a partner creates or edits a listing whose type has a `list` attribute, render a
**repeatable bullet-line input** (add / remove lines) for that attribute; `text` stays
a single input; `select`/`multiselect`/`number`/`boolean` are unchanged. Values are
written to `Listing.attributes` (JSON), already validated against the type's schema on
submit. (Find the current attribute-value editor in the partner listing form and extend
its type switch with the `list` case.)

### 5. Storefront rendering

- **Spec cards on the listing / room detail.** Today
  `apps/storefront/app/features/listing-group/room-attributes.ts` flattens
  `attributes` into ≤5 rows with position-based icons and humanized keys. Change the
  detail rendering to resolve each attribute against the listing type's
  `attributeSchema` (already present in the public listing-type response) to get its
  **label, icon, type, and order**, and render each as a card:
  `icon + label + (single text value | bullet list)`. A `list` value renders as a
  `<ul>` of its strings; `text`/`number`/`boolean`/`select` render as a single value.
  Add a small storefront lucide-by-name renderer (mirror of `ListingTypeIcon`) for the
  attribute icon, falling back to a neutral default when `icon` is unset.
  - `capacity`/guest handling stays as-is (rendered separately, filtered out of the
    card list — keep `roomCapacity` and its exclusion).
- **Filter panel.** `apps/storefront/app/features/catalog/components/filter-panel.tsx`
  renders each attribute facet's `icon` (from `PublicCatalogFacet.icon`) next to its
  label, using the same storefront lucide-by-name renderer. Facets with no icon render
  as today.

### 6. API

- The public catalog search facet builder (catalog module) sets `icon` on each
  attribute facet from the corresponding `attributeField.icon`. This is a mapping-only
  change in the facet assembly — no use-case flow, port, or repository shape change,
  and no new endpoint. Controller → use-case → repository-port → repository stays intact
  (no service class).
- No other API change. The public listing-type response already carries
  `attributeSchema`, so the new `icon` and `list` type surface to the storefront with no
  DTO change beyond the shared schema edit.

## Data flow

```
Tenant (dashboard) ── configures attributeSchema[{key,label,type,icon,filterable,options}]
                       + searchConfig.attributeFacets           ─┐
                                                                  │  (JSON, no migration)
Partner (dashboard) ─ fills Listing.attributes {key: value|string[]} ─┘
                                                                  │
API public responses ─ publicListingType.attributeSchema (label+icon+type+order)
                       publicCatalogFacet.icon                    │
                                                                  ▼
Storefront ── detail: join attributes × attributeSchema → icon+title+bullets spec cards
           └─ catalog: facet.icon rendered next to each attribute filter
```

## Affected files (indicative, not exhaustive)

- `packages/contracts/src/contracts/listing-type.ts` — `attributeFieldSchema.icon`,
  `list` type, `LISTING_TYPE_ICONS` growth, `ICON_LABEL` map, list-not-filterable rule.
- `packages/contracts/src/contracts/catalog-search.ts` — `publicCatalogFacetSchema.icon`.
- `apps/dashboard/app/components/icon-picker.tsx` — new reusable picker.
- `apps/dashboard/app/features/tenant/components/listing-type-attribute-fields.tsx`,
  `listing-type-form.tsx`, `constants.ts` — picker wiring + `list` type label.
- Partner listing form (attribute-value editor) — `list` bullet-line input.
- `apps/storefront/app/features/listing-group/room-attributes.ts` and the detail
  components that consume it — schema-resolved spec cards.
- `apps/storefront/app/features/catalog/components/filter-panel.tsx` — facet icons.
- A storefront lucide-by-name icon renderer (new small module).
- Catalog module facet builder (API) — populate `facet.icon`.

## Verification (no automated tests — ADR 0005)

1. `pnpm --filter=@booking/contracts build`
2. `pnpm turbo lint typecheck build`
3. Run the app (`docker compose up -d` + `pnpm dev`) and exercise end-to-end:
   - Dashboard → tenant → listing type: add an attribute, pick an icon, set type
     `list`; confirm `filterable` is disabled for `list`; set the listing type's own
     icon via the new picker.
   - Partner → create a listing of that type: fill a `list` attribute with several
     bullet lines and a `text` attribute; save.
   - Storefront → listing detail: the attribute renders as an icon-led spec card with
     the bullet list; catalog filter shows the icon next to the attribute facet.
