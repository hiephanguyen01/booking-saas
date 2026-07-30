# Dashboard Date Range Filter — Design QA

## Evidence

- Source trigger:
  `/Users/hiephanguyen01/Library/Application Support/CleanShot/media/media_t149tQq1uq/CleanShot 2026-07-30 at 14.32.56@2x.png`
- Source popup:
  `/Users/hiephanguyen01/Library/Application Support/CleanShot/media/media_7FVIiQ6SPi/CleanShot 2026-07-30 at 14.31.07@2x.png`
- Implementation route: `http://localhost:5174/partner/bookings`
- Implementation trigger screenshot: `/private/tmp/bookingos-date-filter-closed.png`
- Implementation popup screenshot: `/private/tmp/bookingos-date-filter-popup.png`
- Combined trigger comparison: `/private/tmp/bookingos-date-trigger-comparison.png`
- Combined popup comparison: `/private/tmp/bookingos-date-filter-comparison.png`

## Capture normalization

- Source trigger: 328 × 102 px.
- Source popup: 714 × 574 px.
- Implementation captures: 1707 × 960 px from the Codex in-app browser desktop viewport.
- The implementation was evaluated as a component crop within the full dashboard capture. The final
  semantic copy adjustment from `Ngày đặt` to `Ngày diễn ra` does not alter geometry.
- Combined comparisons place the unscaled source beside an unscaled implementation crop. The source
  uses its supplied light theme while the active dashboard session uses dark theme; color differences
  caused only by the active semantic theme are intentional.
- State: inactive trigger and open date-range popup with no applied range.

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
- **Spacing and layout rhythm:** The popup matches the reference structure: heading, grouped range
  surface, preset chips, then actions. The implementation uses a horizontal desktop range row and
  collapses to one column through its responsive grid.
- **Colors and visual tokens:** Background, border, primary, secondary, muted, and focus colors all use
  semantic dashboard tokens. The dark capture differs from the light reference only because of the
  current theme.
- **Image quality and assets:** No raster image assets are required. Calendar, arrow, and chevron use
  the existing icon library and render sharply.
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
- Escape discarded a changed draft and preserved the applied URL.
- The DOM exposes contextual trigger naming, labelled date inputs, a dialog heading, keyboard buttons,
  and six preset buttons.
- Browser logs contain Vite/React development information only; no warning or error entry was emitted.
- Responsive classes constrain popup width to the viewport, stack the range fields below `sm`, make
  the trigger full-width on small screens, and retain the toolbar's wrapping layout.

## Findings

No actionable P0, P1, or P2 mismatch remains.

Intentional differences:

- The implementation inherits the current dashboard theme instead of forcing the light reference
  palette.
- The reference's time-mode and minute/hour chips were removed by requirement.
- The reference's inactive `Tất cả` copy was replaced by the contextual date label by requirement.

## Comparison history

Initial comparison found the expected approved differences only. No P0/P1/P2 visual fix was required,
so no additional visual iteration was necessary.

## Static verification

The complete repository gate passed:

- no-tests policy;
- module cycles;
- frontend structure;
- storefront security;
- Turbo lint, typecheck, and build: 24/24 successful;
- API RLS: 46/46 tenant-scoped tables covered.

final result: passed
