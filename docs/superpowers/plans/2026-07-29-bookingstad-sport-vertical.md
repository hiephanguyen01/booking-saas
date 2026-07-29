# BookingStad Sport Vertical Implementation Plan

> **For agentic workers:** Execute inline in the current worktree; do not create tests.

**Goal:** Make BookingStad's intentional `sport` vertical valid across the shared contract and frontend consumers.

**Architecture:** Add `sport` at the contract boundary, then update explicit Dashboard option and label mappings. Preserve the Storefront's documented fallback template behavior.

**Tech Stack:** TypeScript, Zod, React Router, Turborepo.

## Global Constraints

- Never add test files or test scripts; ADR 0005 requires runtime and static verification.
- Preserve unrelated user changes in the dirty worktree.
- Keep the fix limited to vertical validation and presentation.

### Task 1: Align the vertical contract

**Files:**
- Modify: `packages/contracts/src/contracts/tenancy.ts`
- Modify: `packages/contracts/src/contracts/platform.ts`

- [ ] Add `sport` to `verticalSchema` and its contract documentation.
- [ ] Build `@booking/contracts` and parse the live BookingStad tenant payload with `publicTenantResponseSchema`.

### Task 2: Align Dashboard consumers

**Files:**
- Modify: `apps/dashboard/app/routes/admin/tenants/_index.tsx`
- Modify: `apps/dashboard/app/constants/tenancy.ts`
- Modify: `apps/dashboard/app/features/tenant/components/settings/settings-overview.tsx`

- [ ] Add `sport` to the admin filter values and Vietnamese label maps.
- [ ] Add an explicit sport label to tenant settings.
- [ ] Run relevant lint/typecheck/build checks.

### Task 3: Verify the original symptom

- [ ] Replace unsupported sport search facet controls with schema-supported controls and validate them during seed construction.
- [ ] Add seeded sport glyphs to the shared icon allowlist and Dashboard labels.
- [ ] Rerun the idempotent seed to repair existing BookingStad listing-type rows.
- [ ] Confirm `GET /public/listing-types` returns 200 for BookingStad.
- [ ] Request `http://bookingstad.localhost:5173/vi/account/bookings` and confirm it redirects unauthenticated users to login instead of returning 502/503.
- [ ] Compare the final diff with the approved scope and confirm unrelated changes remain untouched.
