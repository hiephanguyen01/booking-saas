# StudioHub Mobile Search and Home Header — Design QA

## Evidence

- Source visual truth:
  `/Users/hiephanguyen01/Library/Application Support/CleanShot/media/media_IduLBkYCbF/CleanShot 2026-08-09 at 01.07.12@2x.png`
- Browser-rendered implementation:
  `/private/tmp/studiohub-mobile-search-767.png`
- Focused comparison:
  `/private/tmp/studiohub-mobile-search-comparison.png`
- Follow-up source visuals:
  `/Users/hiephanguyen01/Library/Application Support/CleanShot/media/media_m0MBP9JMQk/CleanShot 2026-08-09 at 01.26.45.png`
  and
  `/Users/hiephanguyen01/Library/Application Support/CleanShot/media/media_Kccy68dNbJ/CleanShot 2026-08-09 at 01.26.35.png`
- Follow-up browser captures:
  `/private/tmp/studiohub-search-back-fixed-390.png` and
  `/private/tmp/studiohub-home-menu-hidden-390.png`
- Follow-up focused comparison:
  `/private/tmp/studiohub-mobile-header-followup-comparison.png`
- Implementation route: `http://studiohub.localhost:5175/vi/t/studio`

## Capture normalization

- Source: 1566 × 164 px at `@2x`, representing a 783 × 82 CSS-pixel header strip.
- Implementation viewport request: 767 × 844 CSS px. The in-app browser content capture was
  752 × 827 px after browser chrome.
- The implementation search-header strip was cropped to 752 × 82 px and normalized to 1566 × 170
  px for a single focused comparison image.
- State: default Studio catalog, no active filters, Vietnamese locale.
- Follow-up sources are 48 × 54 px and 64 × 68 px crops. The implementation was captured from a
  requested 390 × 844 viewport; the in-app browser content capture was 375 × 812 px. Focused 60 × 60
  px crops were paired in one 120 × 120 px comparison image without density scaling.

## Full-view comparison

The full mobile catalog was inspected at 390 px and 767 px. The dark sticky header keeps the tenant
category rail, then places the combined two-line search summary and filter action on one row. The sort
rail and result count remain immediately below it without the previous “Studio phù hợp với bạn” title.
The Home mobile header retains the tenant logo and account action while omitting only the hamburger.
On Search, the Back control sits outside the horizontally scrolling category rail.

## Focused region comparison

- **Fonts and typography:** The combined trigger uses the configured tenant font with a bold query
  line and smaller muted location/date/guest summary, matching the source hierarchy.
- **Spacing and layout rhythm:** Search and filter controls align on one row with consistent 12 px
  outer spacing, a compact gap, matching rounded corners, and equal vertical centering.
- **Colors and visual tokens:** The header, foreground, muted text, borders, primary badge, radius, and
  hover states use tenant semantic tokens rather than StudioHub literals.
- **Image quality and assets:** No raster assets are required. Search and three-line filter symbols use
  the existing Lucide icon package; the supplied Back and Menu crops are treated as control-state
  references rather than image assets.
- **Copy and content:** The visible search text comes from real URL/loader state. The standalone Edit
  label and “Studio phù hợp với bạn” title are absent.

## Interaction and responsive checks

- Clicking the complete summary control opens the existing Edit Search drawer.
- Clicking the filter control opens the existing Filter drawer with all live filter sections.
- The active-filter badge remains wired to URL filter state.
- At 768 px, the standard tenant header and desktop result title are visible and the mobile combined
  control is hidden.
- At 390 px Home, `Mở menu` is hidden while the registration action and bottom navigation remain.
- The Search category rail was scrolled horizontally from `0` to `260`; the Back control stayed at
  `x=12, y=8`. After a vertical page scroll to `567`, it still stayed at `x=12, y=8`.
- At 768 px Home, `Mở menu` remains visible, preserving the existing tablet layout.
- Browser console only contains the existing development CSP nonce hydration warning; no new runtime
  error was observed from this change.

## Findings

No actionable P0, P1, or P2 mismatch remains.

## Comparison history

- First pass: the filter action still used the sliders-with-knobs symbol, which differed from the
  source's three narrowing horizontal lines.
- Fix: changed the action to the existing `ListFilter` icon.
- Post-fix: focused comparison confirms the requested search/filter composition and icon treatment.
- Follow-up pass: the Home hamburger was scoped to `max-md:hidden`, and the Search Back control was
  separated from the overflow rail. Post-fix runtime evidence confirms both requested states without
  changing the tablet header.

## Static verification

- no-tests policy: passed;
- frontend structure: passed;
- storefront security: passed;
- storefront lint: passed;
- storefront typecheck: passed;
- storefront production build: passed.

final result: passed
