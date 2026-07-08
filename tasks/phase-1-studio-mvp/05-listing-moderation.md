# Task 1.5 — Listing moderation & trust signals

**Phase:** 1 — Studio MVP · **Depends on:** 1.4 · **Design refs:** TONG-QUAN.md §7 (moderation, anti-disintermediation), §16

## Goal
Every post passes tenant review before publishing; contact-info leakage is blocked; storefront shows trust signals.

## Scope
- [ ] `pending_review` → `published` flow; `published_by` / `hidden_by` (`partner`/`admin`) — admin-hidden posts cannot be re-published by the partner (domain rule)
- [ ] Review checklist for the tenant reviewer
- [ ] **Contact-info scanning** (regex: phone, Zalo, external links) in description/images metadata at review time; partner contact only revealed to the customer **after booking confirmed**
- [ ] Trust signals on storefront: "identity verified" badge, completed-booking count, "active since", average approval response time

## Definition of Done
- A post containing a phone number is flagged at review; hidden-by-admin lockout enforced by domain test; trust signals render from real data
