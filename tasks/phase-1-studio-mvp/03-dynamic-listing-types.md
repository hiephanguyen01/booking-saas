# Task 1.3 — Dynamic listing types

**Phase:** 1 — Studio MVP · **Depends on:** 1.1 · **Design refs:** TONG-QUAN.md §7, §16

## Goal
Tenants define their own listing types with attribute schemas; storefront menus and filters generate themselves.

## Scope
- [ ] `CRUD /tenant/listing-types`: name, `allowed_modes`, attribute schema (typed fields: select, boolean, number, text)
- [ ] Attribute values validated against the schema on listing create/update
- [ ] Auto-generated storefront menu per type + filter UI from attribute schema (`attr.*` query params)
- [ ] Flag for "people-booking" types that require partner identity verification (links to task 1.2)

## Definition of Done
- Creating a new listing type with attributes immediately yields a working menu entry and filters on the storefront, no code change
