# Task 1.15 — Storefront: studio template

**Phase:** 1 — Studio MVP · **Depends on:** 1.6, 1.7, 1.11 · **Design refs:** TONG-QUAN.md §16, §18, §19

> **Paths below are as-proposed, not as-shipped.** This ticket predates the storefront's
> feature-folder refactor, so the flat `app/components/*` and `app/routes/*` files it names (slot
> picker, date-range calendar, lookup, my-bookings, group…) do not exist at those paths any more —
> they live under `app/features/<name>/{components,hooks,server,lib}`, a layout now enforced by
> `pnpm check:frontend-structure`. Read [`apps/storefront/CLAUDE.md`](../../apps/storefront/CLAUDE.md)
> for the real structure; keep this ticket as the record of what was scoped.

## Goal
A themeable, SEO-ready public site where customers search, book and pay.

## Scope
- [ ] `studio` template; theming via CSS variables from `theme_config`; tenant resolved from Host header (BFF pattern — API calls server-side from RR7)
- [ ] Search/filter by listing type + dynamic attributes; group page (rooms/packages)
- [ ] Slot picker (hourly) + date-range calendar (daily); checkout with promo-code field
- [ ] Booking lookup (code + OTP for guests, my-bookings for accounts)
- [ ] i18n vi/en per `tenants.default_locale` + switcher; sitemap.xml, robots.txt, OG meta

## Definition of Done
- Full booking journey clickable on two tenants with different themes/domains; Lighthouse SEO pass on listing pages


# Task 1.15 — Storefront: Studio Template

Build the full themeable, SEO-ready public storefront where customers search, book, and pay on a studio-vertical tenant site.

## Current State

The storefront already has a working foundation:
- **Root** ([root.tsx](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/root.tsx)): Tenant resolution from Host header, theme via CSS vars, `SiteHeader` with auto-generated listing-type nav, suspended-tenant page
- **Home** ([home.tsx](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/routes/home.tsx)): Hero + listing-type sections with "view all" links
- **Catalog** ([catalog.tsx](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/routes/catalog.tsx)): Listing-type page with dynamic attribute filters
- **Listing Detail** ([listing.tsx](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/routes/listing.tsx)): Gallery, trust signals, quote card with mode/date/quantity picker, price breakdown
- **BFF layer** ([catalog.server.ts](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/lib/catalog.server.ts), [tenant.server.ts](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/lib/tenant.server.ts)): Server-side API calls with `x-forwarded-host`
- **API endpoints**: All public endpoints exist — `/public/listings`, `/public/listings/:slug`, `/public/listings/:slug/availability`, `/public/bookings`, `/public/bookings/:id/checkout`, `/public/checkout/validate-promo`, etc.

## What's Missing (Scope)

Per the task file and §16 of TONG-QUAN.md:

1. **Hourly Slot Picker** — Replace the raw `datetime-local` inputs with a real day-by-day hourly slot picker that queries `/public/listings/:slug/availability?mode=hourly`
2. **Daily Date-Range Calendar** — A visual calendar for daily-mode listings, querying the same availability endpoint with `mode=daily`
3. **Checkout Flow** — A checkout route: confirm booking details, apply promo code, enter guest info, redirect to payment
4. **Booking Lookup** — A route for looking up a booking by code + email OTP (guest checkout), and a `my-bookings` route for authenticated users
5. **Listing Group Page** — The two-tier post structure: a group page showing the group intro, album, amenities, and child rooms/packages
6. **i18n** — Language switcher (vi/en) per `tenants.default_locale`
7. **SEO** — `sitemap.xml`, `robots.txt`, OG meta on listing pages
8. **Theme Enhancements** — Use more of `theme_config` (hero, logo, favicon, seo, contact, social links)

---

## Proposed Changes

### Component 1 — BFF Layer: New Server Functions

#### [MODIFY] [catalog.server.ts](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/lib/catalog.server.ts)

Add BFF functions for:
- `fetchAvailability(request, slug, query)` → calls `GET /public/listings/:slug/availability`
- `fetchListingGroup(request, slug)` → calls `GET /public/groups/:slug`
- `fetchListingGroups(request, search)` → calls `GET /public/groups`

#### [NEW] booking.server.ts

New `apps/storefront/app/lib/booking.server.ts`:
- `createBooking(request, input)` → `POST /public/bookings`
- `checkoutBooking(request, bookingId)` → `POST /public/bookings/:id/checkout`
- `validatePromo(request, input)` → `POST /public/checkout/validate-promo`
- `lookupBooking(request, code, otp?)` → `GET /public/bookings/:code?otp=`
- `requestOtp(request, code)` → `POST /public/bookings/:code/request-otp`
- `cancelBooking(request, code, input)` → `POST /public/bookings/:code/cancel`
- `fetchMyBookings(request)` → `GET /public/my-bookings` (passes session cookie)
- `fetchPaymentStatus(request, code)` → `GET /public/bookings/:code/payment-status`

---

### Component 2 — Hourly Slot Picker & Daily Calendar Components

#### [NEW] slot-picker.tsx

`apps/storefront/app/components/slot-picker.tsx` — An interactive hourly slot picker:
- Renders a horizontal day scroller (7 days by default)
- For the selected day, fetches slots from the availability API and renders a grid of time blocks
- Slots are color-coded: available (accent), busy (gray), selected (primary)
- Clicking a start slot + selecting a duration shows the price in real-time
- Uses `@booking/ui` `Button`, `Badge` components
- Mobile responsive: day tabs on top, slots below

#### [NEW] date-range-calendar.tsx

`apps/storefront/app/components/date-range-calendar.tsx` — A visual monthly calendar for daily mode:
- Renders a calendar grid with days colored by availability status
- Uses the `@booking/ui` `Calendar` component as a base
- Shows per-day pricing
- Allows selecting a check-in → check-out range
- Blocked/closed days are disabled

#### [MODIFY] [listing.tsx](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/routes/listing.tsx)

Replace the raw `datetime-local` form with:
- A `BookingMode` tab toggle ("Theo giờ" / "Theo ngày") when the listing supports multiple modes
- The `SlotPicker` component when `hourly` mode is selected
- The `DateRangeCalendar` component when `daily` mode is selected
- A quantity picker for `inventory` mode
- Keep the existing `QuoteCard` / `Breakdown` rendering for the price summary

---

### Component 3 — Checkout Route

#### [NEW] checkout.tsx

`apps/storefront/app/routes/checkout.tsx` — Route: `/checkout/:listingSlug`

**Loader**: Receives booking params from query string (mode, from, to, quantity), fetches the listing + quote.

**Component**:
- Booking summary (listing name, selected slot, price breakdown)
- Promo code input with inline validation (`POST /public/checkout/validate-promo`)
- Guest info form (name, email, phone) — OR "you're logged in as..."
- Customer note textarea
- "Đặt chỗ" (Book) CTA button

**Action**: Calls `createBooking()` then `checkoutBooking()`, redirects to the gateway payment URL or a confirmation page.

#### [NEW] booking-confirmation.tsx

`apps/storefront/app/routes/booking-confirmation.tsx` — Route: `/booking/:code`

- Shows booking details (code, status, dates, price)
- Polls payment status if `pending_payment`
- Cancel button with confirmation dialog (computes refund per policy)
- If confirmed, shows a "thank you" state with booking details + partner contact info

---

### Component 4 — Booking Lookup & My Bookings

#### [NEW] lookup.tsx

`apps/storefront/app/routes/lookup.tsx` — Route: `/lookup`

- Form: Enter booking code → request OTP → enter OTP → view booking
- Uses the existing `POST /public/bookings/:code/request-otp` and `GET /public/bookings/:code?otp=` endpoints

#### [NEW] my-bookings.tsx

`apps/storefront/app/routes/my-bookings.tsx` — Route: `/my-bookings`

- Requires authentication (redirects to login if not authenticated)
- Lists all bookings for the logged-in customer
- Each booking card shows: code, listing name, date/time, status badge, amount
- Click → navigates to `/booking/:code`

---

### Component 5 — Listing Group Page

#### [NEW] group.tsx

`apps/storefront/app/routes/group.tsx` — Route: `/g/:groupSlug`

- Shows the listing group (studio/photographer post): title, description, gallery, amenities, address
- Lists child rooms/packages as cards with their own pricing
- Each child links to the listing detail page (`/l/:listingSlug`)
- Trust signals at the group level

---

### Component 6 — Theme Enhancements

#### [MODIFY] [root.tsx](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/root.tsx)

- Read full `theme_config` from the tenant API response (logo, favicon, seo meta, hero, contact, social)
- Set `<link rel="icon" href="...">` from `faviconUrl`
- Pass SEO info to meta function

#### [MODIFY] [tenant.server.ts](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/lib/tenant.server.ts)

- Expand `StorefrontTenant` to include: `logoUrl`, `faviconUrl`, `hero` (title, subtitle, imageUrl), `seo` (title, description), `contact`, `socialLinks`

#### [MODIFY] [theme.ts](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/theme/theme.ts)

- Extend `themeStyle()` to add more CSS variables: `--sf-muted` (derived from text), font family
- Add a `--sf-primary-foreground` for text-on-primary contrast

#### [MODIFY] [site-header.tsx](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/components/site-header.tsx)

- Show logo image if `logoUrl` is set
- Add language switcher (VI/EN)

#### [MODIFY] [home.tsx](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/routes/home.tsx)

- Use `hero.title`, `hero.subtitle`, `hero.imageUrl` from theme_config instead of hardcoded text/picsum

#### [MODIFY] root.tsx footer

- Add contact info (phone, address) and social links from theme_config

---

### Component 7 — SEO: Sitemap, Robots, OG Meta

#### [NEW] sitemap[.]xml.tsx

`apps/storefront/app/routes/sitemap[.]xml.tsx` — Route: `/sitemap.xml`

- Loader fetches all published listing groups + standalone listings
- Generates a sitemap XML response

#### [NEW] robots[.]txt.tsx

`apps/storefront/app/routes/robots[.]txt.tsx` — Route: `/robots.txt`

- Returns `Allow: /` + `Sitemap: https://{host}/sitemap.xml`

#### [MODIFY] listing.tsx, group.tsx, catalog.tsx, home.tsx

- Add proper `meta()` exports with `og:title`, `og:description`, `og:image`, `og:type`
- Structured heading hierarchy: single `<h1>` per page

---

### Component 8 — Routes Configuration

#### [MODIFY] [routes.ts](file:///Users/duyvo/Desktop/booking-saas/apps/storefront/app/routes.ts)

Add new routes:
```ts
route('g/:groupSlug', 'routes/group.tsx'),
route('checkout/:listingSlug', 'routes/checkout.tsx'),
route('booking/:code', 'routes/booking-confirmation.tsx'),
route('lookup', 'routes/lookup.tsx'),
route('my-bookings', 'routes/my-bookings.tsx'),
route('sitemap.xml', 'routes/sitemap[.]xml.tsx'),
route('robots.txt', 'routes/robots[.]txt.tsx'),
```

---

## Open Questions

> [!IMPORTANT]
> **Authentication on storefront**: The current storefront has no auth routes (login/register). The `my-bookings` page and authenticated checkout require a session cookie. Should I:
> - Add storefront auth routes (login/register pages) in this task?
> - Or scope `my-bookings` to Phase 2 and keep everything guest-checkout-only for now?

> [!IMPORTANT]
> **i18n implementation depth**: Full i18n (using `remix-i18next` or a custom hook reading `vi.json`/`en.json` from `@booking/shared`) is a significant effort. Should I:
> - Implement a basic `useTranslation` hook that reads from the shared i18n JSON files + a language switcher that changes `tenants.default_locale`?
> - Or keep all UI text in Vietnamese for this task and add the i18n plumbing in a separate pass?

> [!IMPORTANT]
> **Listing group API**: The task scope includes group pages, but I don't see a `GET /public/groups/:slug` endpoint in the existing API. The API has `/public/listings` and `/public/listing-types` but not a public groups endpoint. Should I:
> - Add the missing API endpoint as part of this task?
> - Or skip the group page and link listings directly (no two-tier structure)?

---

## Verification Plan

### Manual Verification
- Two tenants with different `theme_config` colors → the storefront looks different (different primary/accent colors, different hero text, different logos)
- Full booking journey: browse → pick a slot (hourly) → checkout → enter guest info + promo code → redirect to mock payment → booking confirmed → view booking by code
- Daily booking: browse → pick dates on the calendar → checkout
- Booking lookup: enter booking code → OTP → view booking → cancel
- Lighthouse SEO audit on a listing page → pass
- `sitemap.xml` and `robots.txt` render correctly
- Mobile responsive: all pages render correctly on mobile viewport

### Automated Tests
- `pnpm turbo lint typecheck` passes for the storefront
- Existing E2E booking journey (if Task 1.17 seeds are available) covers the new routes
