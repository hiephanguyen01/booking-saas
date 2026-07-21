### Task 17 report — Dedup renderer trùng (code-cleanup, no UX change)

## Extracted

### 1. Child table vs mobile card — `grouped-listing-item.tsx` (DONE)

File: `apps/dashboard/app/features/partner/components/listing-groups/grouped-listing-item.tsx`

Both `buildGroupedListingColumns` (desktop `DataTableColumn`s) and `GroupedListingCard` (mobile card)
rendered the same six fields (thumbnail, title/slug, booking-mode badges, status, price, deposit/stock,
cancellation policy, actions) with slightly different wrapper markup. Diffed every fragment byte-for-byte
before merging; two fragments had a real (but purely cosmetic) difference and were parameterized instead
of blindly merged:

- Thumbnail size differs (`size-12` desktop vs `size-16` mobile) → `ChildThumbnail({ listing,
  sizeClassName })` takes the size as a prop.
- Mode-badges wrapper className differs (`flex flex-wrap gap-1` vs `mt-2 flex flex-wrap gap-1`) →
  `ChildModeBadges({ modes })` returns only the `<Badge>` fragment; each caller keeps its own wrapping
  `<div className=...>`.

New private helpers added to the same file (feature-local — only the partner area uses this row shape,
so nothing needed to move to `app/components/`): `ChildThumbnail`, `ChildTitleLink`, `ChildSlugLine`,
`ChildModeBadges`, `ChildDepositStock`. (`ChildPrice` was already shared before this task.) Both
`buildGroupedListingColumns` and `GroupedListingCard` now call these instead of duplicating the JSX; all
original class names, conditionals, and element nesting are preserved exactly — only the duplicated
JSX bodies moved into named functions.

Single call site (`apps/dashboard/app/routes/partner/listing-groups/detail.tsx`) — verified no external
consumer relies on internal structure.

### 3. Group content card — Ảnh/Mô tả/Tiện ích sections (DONE, partial — see note)

New shared file: `apps/dashboard/app/components/media-detail-sections.tsx`
- `PhotoAndDescriptionSections({ photos, alt, description, photoEmptyMessage })` — the "Ảnh" +
  "Mô tả" `DetailSection` pair, byte-identical in all three call sites except the photo empty-state
  copy ("Chưa có ảnh nào." for a single listing vs "Chưa có ảnh." for a group), which is now an
  explicit prop with the group wording as the default.
- `AmenitiesSection({ amenities })` — the "Tiện ích" badge list, byte-identical in the two group-level
  content cards.

Call sites updated (JSX-only change, surrounding `Card`/`DetailGrid`/other fields untouched):
- `apps/dashboard/app/features/tenant/components/listing-review/listing-content-card.tsx`
  (`ListingContentCard`) — passes `photoEmptyMessage="Chưa có ảnh nào."`.
- `apps/dashboard/app/features/tenant/components/group-review/group-content-card.tsx`
  (`GroupContentCard`) — also now uses `AmenitiesSection`; removed the now-unused `Badge`/`DetailSection`
  imports.
- `apps/dashboard/app/features/partner/components/listing-groups/listing-group-summary.tsx`
  (`ListingGroupContentCard`) — also now uses `AmenitiesSection`; removed the now-unused `Badge`/
  `DetailSection` imports.

**Note on scope**: I did NOT merge the whole "Nội dung"/"Nội dung chung" cards. Diffing them showed real,
visible differences that a blind merge would have erased: different `CardTitle` ("Nội dung chung" vs
"Nội dung"), different `CardDescription` wording ("Album và nội dung dùng chung…" vs "Album và thông tin
dùng chung…"), different field sets (tenant's group card also shows "Giá từ"/"Số hạng mục"/"Địa chỉ" via
`formatLocation`, partner's shows "Khu vực hoạt động"/"Địa chỉ" via a local `addressLine()` helper with
different join logic), and different section order (tenant puts its `DetailGrid` before Ảnh/Mô tả;
partner puts it after). Extracting *only* the parts that were truly byte-identical (Ảnh+Mô tả, and
separately Tiện ích, both of which sit at a shared position — Ảnh immediately followed by Mô tả in both,
Tiện ích last in both) captures all the safe duplication without touching anything visible.

## Skipped

### 2. Moderation-log grid — SKIPPED

Compared `ListingModerationLogCard` (tenant, `listing-review/listing-content-card.tsx`, a dedicated
"Trạng thái & nhật ký" card with 6 fields: Xuất bản bởi, Ẩn bởi, Gửi duyệt lúc, Xuất bản lần đầu, Tạo lúc,
Cập nhật lúc) against `ListingGroupOverviewCard` (partner, `listing-group-summary.tsx`, a general "Tổng
quan" card with 7 fields: Đường dẫn, Giá từ, Trạng thái, Ngày tạo, Cập nhật, Xuất bản bởi, Ẩn bởi). These
are not "the same fields the same way" — only 2 of 6/7 fields overlap (Xuất bản bởi / Ẩn bởi), the
partner card also mixes in unrelated slug/price/status fields, the timestamp granularity differs (tenant
tracks submit + first-publish separately; partner only has generic created/updated), and even the two
overlapping fields have a real behavioral difference: partner passes `omitWhenEmpty` (field disappears
entirely when empty) while tenant does not (field shows an em-dash when empty). Forcing a shared
`ModerationLogGrid` over this would mean either changing the partner card's field set/order (visible
change) or reducing the "shared" component to a thin 2-field wrapper requiring an `omitWhenEmpty` prop
that only saves ~14 duplicated lines — not worth the added indirection for a set of fields that live in
two structurally different cards. Left both cards as-is.

### 4. Effective cancellation-policy renderer — ALREADY SHARED, no action needed

This was already fully extracted before this task, into `apps/dashboard/app/components/cancellation-tiers.tsx`
(`EffectiveCancellationPolicyCell`, `CancellationTiers`, `toCancellationTiers`,
`CANCELLATION_SOURCE_LABEL`). It's already reused by: the partner grouped-listing table/card (this
file), `apps/dashboard/app/features/partner/components/listings/listing-table-columns.tsx`,
`apps/dashboard/app/features/tenant/components/listing-review/listing-policy-card.tsx`,
`apps/dashboard/app/features/tenant/components/settings/tenant-default-cancellation-policy-card.tsx`,
`apps/dashboard/app/routes/partner/cancellation-policies/_index.tsx`, and
`apps/dashboard/app/routes/partner/listings/detail.tsx`. Nothing to dedup.

## Proof of no output change

- Every extraction was done by lifting the *exact* existing JSX (same class names, same conditionals,
  same element order) into a named function/component and calling it from both original call sites — no
  new conditionals, no reordering, no restyle. The one real textual difference found (photo empty-state
  copy) was kept as an explicit prop rather than unified.
- Diffed each pair line-by-line before touching code; documented every divergence found (sizes,
  wrapper classNames, `omitWhenEmpty`, title/description copy, field sets, section order) above.

## Verify

```
nvm use            # → v22.22.0
pnpm turbo lint typecheck build --filter=@booking/dashboard
```
Result: **7/7 tasks successful** (lint, typecheck, build across the dashboard + its `@booking/contracts`/
`@booking/ui`/`@booking/api-client` deps that turbo pulled in). No lint/typecheck errors; only benign
Vite SSR sourcemap warnings ("Error when using sourcemap for reporting an error…") which are pre-existing
and unrelated to this change (they reference `packages/ui` files not touched here).

## Commit

`refactor(dashboard): dedup child-row and group-content renderers trùng`

Files changed:
- `apps/dashboard/app/features/partner/components/listing-groups/grouped-listing-item.tsx` (modified)
- `apps/dashboard/app/features/partner/components/listing-groups/listing-group-summary.tsx` (modified)
- `apps/dashboard/app/features/tenant/components/group-review/group-content-card.tsx` (modified)
- `apps/dashboard/app/features/tenant/components/listing-review/listing-content-card.tsx` (modified)
- `apps/dashboard/app/components/media-detail-sections.tsx` (new)

Commit hash: `8a4ae3f775fb2842549f8a26ccd56a8a0e03fe37`
