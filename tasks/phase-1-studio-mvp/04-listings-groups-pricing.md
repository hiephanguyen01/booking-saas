# Task 1.4 — Listings, groups, modes & pricing

**Phase:** 1 — Studio MVP · **Depends on:** 1.2, 1.3 · **Design refs:** TONG-QUAN.md §7, §9 (listing_groups, listings, resources, pricing_rules)

## Goal
Two-tier posts with flexible booking modes and pricing are fully modelable.

## Scope
- [ ] **Two-tier posts**: `listing_groups` (address, album, amenities) containing multiple listings (rooms/packages)
- [ ] Listings with **multiple modes enabled** (`hourly` + `daily`) via `mode_config` (basePrice, granularity, minDuration, leadTime, buffer)
- [ ] **Block pricing** (e.g. 2-hour / 3-day bundle prices)
- [ ] Calendar-sharing `resources` (one resource backing several listings)
- [ ] Basic `pricing_rules`: weekday/weekend + time windows (e.g. golden hours)
- [ ] Image upload to minio (album on group + listing)

## Definition of Done
- A group with 4 rooms, shared resources, golden-hour pricing and block pricing prices a quote correctly (unit-tested price calculator)
