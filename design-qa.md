# Dashboard Date Range Filter — Design QA

## Evidence

- Source trigger:
  `/Users/hiephanguyen01/Library/Application Support/CleanShot/media/media_t149tQq1uq/CleanShot 2026-07-30 at 14.32.56@2x.png`
- Source popup:
  `/Users/hiephanguyen01/Library/Application Support/CleanShot/media/media_Q6T7Ovt6WC/CleanShot 2026-07-30 at 14.55.30@2x.png`
- Implementation route: `http://localhost:5174/partner/bookings`
- Implementation reviewed live in the Codex in-app browser at desktop and mobile breakpoints.

## Capture normalization

- Source trigger: 328 × 102 px.
- The latest source is a full-dashboard capture; the popup region was evaluated independently.
- The implementation was reviewed at the default desktop viewport and a temporary mobile viewport.
- The source uses its supplied light theme while the active dashboard session uses dark theme; color
  differences caused only by the active semantic theme are intentional.
- States: applied range, start-date picker, end-date picker, invalidated end date, and closed popup.

## Full-view comparison

The implementation keeps the filter in the wrapping toolbar row and the popup visually anchored below
the trigger. The popup remains above the independently scrolling table and does not move toolbar or
pagination content into the table viewport.

The user-requested differences from the reference are present:

- inactive trigger uses the contextual label `Ngày diễn ra`, not `Tất cả`;
- only the six date presets remain;
- status is a dropdown filter instead of tabs on partner bookings.

## Focused region comparison

Focused trigger and popup crops were compared because the full dashboard makes control typography and
spacing too small to judge accurately.

- **Fonts and typography:** Existing dashboard type tokens remain consistent. Heading, field labels,
  helper label, preset labels, and action labels preserve a clear hierarchy.
- **Spacing and layout rhythm:** The compact popup shows two date controls, preset controls, then
  actions. The main popup never renders a calendar by default; each date control opens its own
  one-month shadcn Calendar.
- **Colors and visual tokens:** Background, border, primary, secondary, muted, and focus colors all use
  semantic dashboard tokens. The dark capture differs from the light reference only because of the
  current theme.
- **Image quality and assets:** No raster image assets are required. Calendar, arrows, and chevrons
  use the existing shadcn and icon components.
- **Copy and content:** Context label, range labels, six preset names, `Áp dụng`, and `Đóng` match the
  approved design.

## Interaction and behavior checks

- Partner seed login successfully rendered `/partner/bookings`.
- No status tablist is present.
- Status dropdown changed the URL to `status=confirmed`.
- Applying `Hôm nay` produced `from=2026-07-30&to=2026-07-30` and the trigger
  `30/07/2026 – 30/07/2026`, while preserving status and page size.
- `Tuần này` produced Monday 27/07/2026 through Sunday 02/08/2026.
- `Tháng trước` produced 01/06/2026 through 30/06/2026.
- Selecting a new start date after the existing end date cleared `to` and kept `Áp dụng` disabled.
- The end-date calendar disabled every day before the selected start date.
- Escape discarded a changed draft and preserved the applied URL.
- The DOM exposes contextual trigger naming, separate `Từ ngày` and `Đến ngày` buttons, one single-date
  calendar at a time, a dialog heading, keyboard buttons, and a labelled six-option preset group.
- Browser logs contain Vite/React development information only; no warning or error entry was emitted.
- Desktop and mobile viewports had no page-level horizontal overflow. Both the main popup and nested
  single-date calendar remained inside the viewport.

## Findings

No actionable P0, P1, or P2 mismatch remains.

Intentional differences:

- The implementation inherits the current dashboard theme instead of forcing the light reference
  palette.
- The reference's time-mode and minute/hour chips were removed by requirement.
- The reference's inactive `Tất cả` copy was replaced by the contextual date label by requirement.

## Comparison history

The native date inputs were replaced with two shadcn single-date popovers. The main filter popup stays
compact and only opens a calendar after the user selects a date field.

## Static verification

The complete repository gate passed:

- no-tests policy;
- module cycles;
- frontend structure;
- storefront security;
- Turbo lint, typecheck, and build: 24/24 successful;
- API RLS: 46/46 tenant-scoped tables covered.

final result: passed
