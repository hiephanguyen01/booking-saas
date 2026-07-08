# Task 1.15 — Storefront: studio template

**Phase:** 1 — Studio MVP · **Depends on:** 1.6, 1.7, 1.11 · **Design refs:** TONG-QUAN.md §16, §18, §19

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
