# Task 0.2 — Initialize shared packages

**Phase:** 0 — Foundation · **Depends on:** 0.1 · **Design refs:** TONG-QUAN.md §5, §18, §19

## Goal
Shared building blocks consumable by api/storefront/dashboard from day one.

## Scope
- [ ] `packages/shared`: zod schemas + types for API contracts (request/response), shared config (eslint, tsconfig), i18n resources (`vi.json`, `en.json`)
- [ ] `packages/ui`: shared component library shell (Button, Calendar, SlotPicker, DataTable placeholders)
- [ ] Wire both packages into the Turborepo build graph

## Definition of Done
- An app can import a zod contract and a UI component from the packages and build cleanly
