# BookingOS default design system + platform-landing locale switcher

Date: 2026-08-05

Two changes that happen to touch the same surface: the BookingOS brand stops being a landing-page
scope and becomes the platform's default design system (inherited by the dashboard whenever no tenant
config exists), and the platform landing's language switcher stops being three ad-hoc controls that
forget the user's choice.

## Part 1 — One default design system

### Today

Three unrelated defaults exist:

| Where | Brand |
| --- | --- |
| `packages/ui/src/styles/globals.css` `:root` / `.dark` | stock shadcn grayscale (`--primary: oklch(0.205 0 0)`) |
| `apps/storefront/app/app.css` `.platform-landing` | BookingOS amber `#ffb020` on ink `#0a0e13`, page `#f4f5f7` |
| `BRAND_DEFAULTS` (`packages/ui/src/lib/brand-theme.ts`) | sky `#0ea5e9` primary, orange `#f97316` accent, white background |

The dashboard has no brand of its own beyond the green sign-in panels in `apps/dashboard/app/app.css`.
So a tenant that has not configured colours gets sky-blue, the dashboard gets grayscale, and the only
place the actual BookingOS brand exists is a CSS scope on one page.

### Target

`packages/ui/src/styles/globals.css` becomes the single source of the BookingOS brand.

- `:root` carries the landing's light palette; `.dark` carries the flipped set that currently lives in
  `.platform-landing .dark`.
- `--accent` stays neutral — it is shadcn's hover/focus surface, not a brand slot. It keeps tracking
  `--muted`, as it does in stock shadcn.
- `--popover`, sidebar tokens, `--destructive`, the status tokens (`--success` / `--warning` / `--info`),
  the chart ramp and the scrims are carried over or retinted to track the new neutrals. Status
  semantics do not change.
- `--sidebar-primary` becomes the brand amber, matching what `tenantBrandStyle` already overrides it
  with for a themed tenant.
- `--radius` is unchanged.

`.platform-landing` shrinks to what is genuinely landing-specific: the `--platform-*` role scale, the
font family, `min-height`. It stops restating base tokens.

This retires a documented footgun. `apps/storefront/CLAUDE.md` currently warns that every token a dark
band reads must be restated in `.platform-landing .dark`, because `@booking/ui`'s `.dark` and
`.platform-landing` have equal specificity and `.platform-landing` wins on source order. Once
`.platform-landing` no longer sets base tokens there is no conflict: `.dark` on an inner band matches a
different element and applies normally. `.platform-landing .dark` keeps only the `--platform-*` dark
values, where its higher specificity is what we want.

`BRAND_DEFAULTS` follows: `primary: #ffb020`, `background: #f4f5f7`. The accent default becomes the same
amber rather than the unrelated `#f97316` — with an amber primary a separate orange reads as a mistake,
and "no accent configured → the brand accent is the brand colour" is the honest default. A tenant that
wants a distinct accent still sets one.

### Consequences by surface

| Surface | Before | After |
| --- | --- | --- |
| Platform landing | amber, from `.platform-landing` | amber, from `:root` — unchanged visually |
| Dashboard, no tenant config | shadcn grayscale | BookingOS amber |
| Dashboard, tenant config | tenant primary via `tenantBrandStyle` | unchanged |
| Storefront, tenant with colours | tenant colours via `themeCss` | unchanged |
| Storefront, tenant without colours | sky `#0ea5e9` | BookingOS amber |

`themeCss` emits every token unconditionally, so a resolved tenant can never fall through to `:root` —
only its `BRAND_DEFAULTS` fallbacks move.

### Dashboard

`.auth-brand-panel` / `.auth-form-panel` are rebranded from green to BookingOS: ink `#0a0e13` brand
panel with amber accents, form panel on the default light surface. The login route already styles
itself entirely with semantic tokens (`bg-background`, `text-primary`, `bg-auth-chip`), so no TSX
changes are needed; the form panel collapses to just its three `--auth-*` tokens because everything else
now comes from `:root`.

Plus Jakarta Sans is imported in `apps/dashboard/app/app.css` the same way the storefront imports it.
The dashboard sets no CSP, so no header work.

Dashboard geometry is unchanged: `h-11` controls, no 54px pills. The landing's `platform-*` component
classes stay landing-local — a dense operator console and a marketing page share a palette, not a
button shape.

### Known consequence

`--warning` (`oklch(0.68 0.15 65)`) now sits near the brand amber in hue. The two are used differently —
a tinted `bg-warning/15 text-warning` badge versus a solid `bg-primary` button — so they remain
distinguishable, and changing status semantics is out of scope here.

## Part 2 — Platform-landing locale switcher

### Today

Three different controls for one job, none of which persist the choice:

- `platform-header.tsx:55` — `<Link to="/${alternateLocale}">` showing the bare code of the language you
  are *not* in, in a small square, `hidden xl:inline-flex` (so invisible below 1280px).
- `platform-header.tsx:106` — mobile menu, a full-width `EN` / `VI` secondary button.
- `platform-footer.tsx:18` — a solid pill for the current locale plus an outlined `<a href>` for the
  other, which is a full page reload.

None of them POST to `/set-locale`, the route that already exists (`routes/set-locale.tsx` →
`handleSetLocaleAction` → `localeCookie`, one year). A plain navigation to `/en` is honoured only because
`resolveLocale` reads the path segment; return to `/` and the choice is gone. Switching also drops the
hash, so reading Pricing and changing language returns you to the top.

### Two bugs found while building this

The switcher was not merely ugly — it did not work, for two reasons discovered during verification.
Both trace to the same thing: server code matching React Router's single-fetch URL as if it were a page
URL. A client-side navigation to `/en` requests **`/en.data`**, and:

1. `PLATFORM_DOCUMENT_PATHS` (`request-security.server.ts`) is an exact allowlist of page paths, so
   `/en.data` fell through to `platformRedirect` and every in-page locale switch was redirected back
   where it started. Clicking the switcher did nothing at all.
2. `resolveLocale` (`i18n.server.ts`) reads the first path segment, which for `/en.data` is `en.data` —
   not a locale — so it fell back to the cookie. Even once navigation worked, the URL read `/en` and
   every word on the page stayed Vietnamese.

`lib/server/data-request.server.ts` now owns that transport detail (`documentPathname`,
`isDataRequestPath`) and both call sites go through it. The allowlist's query guard is skipped for
`.data` requests, whose `?_routes=…` is React Router's, not a visitor's.

### Target

One `PlatformLocaleSwitcher` (`features/platform-landing/components/`), used in the header, the mobile
menu and the footer.

- **Segmented, not a mystery toggle.** `VI | EN` side by side, active segment marked
  `aria-current="true"` and filled, globe icon leading on wide viewports. Both options always visible.
- **Keeps your place.** Each option is a `<Link>` to `switchLocalePath(currentPath, locale)`, which
  carries the fragment — switching from a section leaves you in it.
- **Persists.** Not via a POST. The platform host answers **GET and HEAD only** — `request-security`
  rejects every other method, which is why the consultation form submits client-side and why there is
  no action to post to. Instead the middleware writes `sf_locale` whenever it serves `/vi` or `/en`:
  arriving at a localized URL *is* the choice, and a shared `/en` link says the same thing. The
  companion change is that `platformRedirect` resolves through `resolveLocale` rather than
  `pathLocale`, so `/` — which has no locale segment — honours the remembered choice.
- **Present from `sm:` up** in the header rather than `xl:` only; the mobile menu carries it below that.
  It cannot be always-on: below 640px the brand, the group and the menu button do not fit on one row,
  and the hamburger gets pushed off screen at 320px.

`.platform-locale-switcher` deliberately sets no `display`. `app.css` is unlayered and would outrank
Tailwind's `hidden`/`sm:inline-flex`, making the control impossible to hide at a breakpoint; the
component supplies `inline-flex` as a utility so `cn` can resolve the conflict.

### The hash has to come from `window`, not the router

The landing's section links are plain `<a href="#pricing">` anchors, not `<Link>`s, so the browser
handles the jump and the router never learns about it — `useLocation().hash` is whatever the page
loaded with. `hooks/use-current-location-path.ts` tracks the fragment via `hashchange` and takes the
rest from `useLocation()`, which also keeps the first render SSR-safe.

### Styling

`.platform-locale-switcher` / `.platform-locale-option` join the other `platform-*` component classes in
`apps/storefront/app/app.css`, styled from semantic tokens so they read correctly on both the header's
`--background` and the footer's `--secondary`. The group is 44px tall with 40px segments.

### i18n

Language names are endonyms — "Tiếng Việt" and "English" are shown in their own language, never
translated — so they are component constants, not translation keys. `nav.language` is repurposed from an
aria-label on the old link ("View in English") to the group label ("Ngôn ngữ" / "Language").

## Out of scope

- The tenant storefront header (`site-header-mobile-menu.tsx:102`) has the mirror-image defect: its
  button labels the *current* locale but submits the *next* one, and it exists only in the mobile menu.
  The same component would fix it, but that is tenant-branded surface and a separate change. It does
  benefit from the `documentPathname` fix, which was a real bug for it too.
- **Pre-existing dark-mode defect, found during verification.** Thirteen dashboard call sites pair
  `bg-warning/10` with `text-warning-foreground`. `--warning-foreground` is the ink for a *solid*
  `bg-warning` fill; on a 10% tint over a dark page it is dark-on-dark and unreadable. Three sites
  (`theme-settings-card.tsx`, `tenant/_layout.tsx`, `affiliate-profile-panel.tsx`) already carry a
  hand-written `dark:text-warning` patch — exactly the drift `packages/ui/CLAUDE.md` warns about. The
  fix is `text-warning` at the ten unpatched call sites, per the documented `bg-X/15 text-X` pattern.
  No `--warning*` token changed in this work; `git diff` confirms it.

## Verification

Per ADR 0005 there are no tests. Verification is `pnpm check:frontend-structure`, `pnpm turbo lint
typecheck build`, and running both apps: the landing in both locales at mobile / tablet / desktop widths
with a hash anchor set, a return visit to `/` to confirm the cookie held, the dashboard signed in as
BookingStudio owner (tenant config present) and as the platform admin (no tenant config), plus the
dashboard sign-in screen in light and dark.
