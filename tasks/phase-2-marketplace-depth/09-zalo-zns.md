# Task 2.9 — Zalo ZNS notifications

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §17 · **Prereq:** Zalo OA registered + templates approved (start paperwork in Phase 1)

## Goal
Booking notifications reach Vietnamese customers on Zalo, not just email.

## Scope
- [ ] ZNS adapter behind the notification port; template mapping per event
- [ ] Guest OTP for booking lookup switches to ZNS (email fallback)
- [ ] Delivery status tracking + fallback to email on failure
- [ ] Per-tenant enablement + template config

## Definition of Done
- Confirmed booking triggers ZNS with correct template variables; failures fall back to email exactly once
