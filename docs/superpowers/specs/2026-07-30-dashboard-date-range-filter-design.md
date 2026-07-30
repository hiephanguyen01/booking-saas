# Dashboard Date Range Filter Design

## Goal

Replace separate “from” and “to” date inputs in dashboard list toolbars with one compact,
context-labelled date-range control. Keep every existing URL query, loader, API request, permission,
pagination, and empty/error state unchanged.

On `/partner/bookings`, replace the status tabs with a toolbar filter.

## Shared date-range control

The existing `FilterField` variant with `kind: 'date-range'` remains the public configuration.
`ListToolbar` renders it through a dedicated internal date-range component, so every current and
future `DashboardDataTable` receives the same interaction without route-specific UI code.

The closed trigger shows the field's contextual label while no range is active, for example:

- `Ngày tạo`
- `Ngày đặt`
- `Ngày giao dịch`
- `Ngày ghi nhận`

After a range is applied, the trigger shows `dd/MM/yyyy – dd/MM/yyyy`. A one-sided legacy range is
still supported and shows the available endpoint with an open-ended marker.

The popup contains:

- the contextual field label as its heading;
- a combined start/end date section using native date inputs;
- preset buttons for `Hôm nay`, `Hôm qua`, `Tuần này`, `Tuần trước`, `Tháng này`, and
  `Tháng trước`;
- `Áp dụng` and `Đóng` actions.

No time mode or minute/hour presets are included.

## Date semantics

Preset dates are calculated in the dashboard's Vietnam business timezone. Weeks run from Monday
through Sunday.

- `Hôm nay`: today through today.
- `Hôm qua`: yesterday through yesterday.
- `Tuần này`: Monday through Sunday of the current week.
- `Tuần trước`: Monday through Sunday of the previous week.
- `Tháng này`: first through last day of the current month.
- `Tháng trước`: first through last day of the previous month.

The popup keeps draft values locally. Selecting a preset only updates the draft. The URL changes
only after `Áp dụng`; `Đóng`, Escape, or clicking outside discards unapplied changes. Applying an
empty range clears both date query parameters.

## URL and form integration

The toolbar remains one GET form:

- current `fromKey` and `toKey` names are preserved;
- `pageSize` and URL parameters not owned by the toolbar remain preserved;
- applying a date range omits `page`, returning to page 1;
- search debounce and other enum filters behave as before;
- `readListFilters` continues converting the two day values to ISO start/end bounds.

No browser-side API request is introduced.

## Context labels

Existing generic `Ngày` labels are replaced with the closest domain meaning while keeping the same
query keys:

- bookings: `Ngày đặt`;
- payments and transactions: `Ngày giao dịch`;
- reviews, promotions, affiliate commissions: `Ngày tạo`;
- ledger: `Ngày ghi nhận`.

If a future route uses a different date meaning, it supplies that meaning through the existing
`label` field.

## Partner bookings

`/partner/bookings` no longer passes `tabs` to `DashboardDataTable`. Its status values become an
`enum` field in a partner-bookings filter spec:

- Tất cả
- Chờ duyệt
- Đã xác nhận
- Hoàn tất
- Đã huỷ

The filter still writes the same `status` URL parameter and the loader still validates and sends the
same API query. Changing it resets to page 1 and preserves the other toolbar parameters.

## Responsive and accessibility behavior

- The date trigger occupies the same wrapping filter row as other controls and expands on small
  screens without causing page-level horizontal overflow.
- The popup is bounded to the viewport and remains usable on mobile.
- The trigger announces its contextual label and active value.
- Presets and actions are keyboard-operable; Escape follows normal popover dismissal behavior.
- Existing focus rings, semantic theme tokens, and dark mode styles are retained.

## Verification

No test files are added.

Verification covers:

- each preset's exact Monday–Sunday/month boundary in Vietnam time;
- custom and one-sided ranges;
- Apply versus Close/Escape behavior;
- URL preservation, page reset, search debounce, and reset-filter behavior;
- `/partner/bookings` status filtering without tabs;
- mobile wrapping and popup containment;
- independent horizontal table scrolling;
- full repository static checks required by `AGENTS.md`;
- browser QA against the supplied compact trigger and popup references.

## Scope

This change does not modify contracts, API endpoints, repositories, dashboard table pagination,
column visibility, table scroll boundaries, or embedded `DataTable` behavior.
