# Vietnam Two-Level Administrative Divisions for Partner Onboarding

**Implementation status (2026-07-15):** Complete. Unit/contract tests, lint, Prisma validation, API build, and Storefront build pass. Testcontainers integration coverage is implemented but could not execute in the current environment because no Docker-compatible container runtime is available. Storefront-wide type-check remains blocked by unrelated pre-existing auth/i18n/API-client errors.

**Goal:** Seed the official post-2025 Vietnamese province/city and ward/commune catalog, expose it through read-only APIs, and replace free-text three-level address entry in Partner onboarding with validated two-level selections.

**Architecture:** Add global reference tables for the 34 province-level and 3,321 commune-level administrative units defined by Decision `19/2025/QĐ-TTg`, effective `2025-07-01`. The data is a version-controlled seed fixture, not downloaded at seed/runtime. A small hexagonal `administrative-division` module owns reads and public endpoints. Partner application accepts codes, resolves the pair server-side, and stores codes plus canonical-name snapshots in the existing `contactInfo` JSON. The Storefront loads provinces in the profile loader and wards through a same-origin resource route when the selected province changes.

**Tech stack:** Prisma/PostgreSQL, NestJS 11, Zod contracts, React Router, React Hook Form, shared shadcn combobox.

## Confirmed product decisions

- Use the current two-level address hierarchy: `Tỉnh/Thành phố` → `Phường/Xã/Đặc khu`; remove `Quận/Huyện` from new Partner applications.
- Preserve official administrative codes as strings so leading zeroes are never lost: two characters for province-level codes and five for commune-level codes.
- Seed reference data in every environment, independently of `SEED_DEMO`; Partner onboarding depends on it in production as well as development/tests.
- Keep existing Partner rows readable. Do not attempt to infer/backfill codes from legacy free-text `contactInfo` in this milestone.
- Keep the current Partner schema narrow: validated codes and canonical display-name snapshots remain in `contactInfo` JSON. Normalized Partner columns and marketplace geo-search are separate follow-ups.
- Seed from a checked-in dataset derived from the official decision. Do not scrape or call a third-party location API at runtime.

## Public API contract

```http
GET /public/administrative-divisions/provinces
200 [{ "code": "79", "name": "Thành phố Hồ Chí Minh", "type": "municipality" }]

GET /public/administrative-divisions/wards?provinceCode=79
200 [{ "code": "xxxxx", "provinceCode": "79", "name": "Phường ...", "type": "ward" }]
```

- Both endpoints are `@Public()`, read-only, deterministically sorted, and return `Cache-Control: public, max-age=86400`.
- `provinceCode` must match `^\d{2}$`; malformed input returns the project-standard 400 Problem Details response.
- A well-formed but unknown province code returns an empty collection. Partner submission still rejects an unknown or mismatched province/ward pair.
- No tenant header or Host resolution is required because this is global reference data.

## Task 1: Add shared contracts first

**Files:**

- Create `packages/contracts/src/contracts/administrative-division.ts`
- Create `packages/contracts/src/contracts/administrative-division.spec.ts`
- Modify `packages/contracts/src/index.ts`
- Modify `packages/contracts/src/contracts/partner.ts`
- Modify `packages/contracts/src/contracts/partner-onboarding.spec.ts`

1. Define schemas/types for province type (`province | municipality`), ward type (`ward | commune | special_zone`), province option, ward option, and the wards query.
2. Define a strict `partnerContactInfoSchema` with `phone`, `provinceCode`, `wardCode`, and `address`; replace `z.record(z.unknown())` in `partnerApplyInputSchema` with this required shape for self-applications.
3. Replace `province`, `district`, and `ward` in `partnerOnboardingProfileSchema` with required `provinceCode` and `wardCode`; retain the detailed `address` field.
4. Add contract tests proving leading-zero codes are preserved, malformed codes fail, `district` is no longer part of the parsed onboarding output, and Partner apply contact data is no longer arbitrary JSON.

## Task 2: Add schema, migration, and authoritative seed fixture

**Files:**

- Modify `apps/api/prisma/schema.prisma`
- Create `apps/api/prisma/migrations/<timestamp>_administrative_divisions/migration.sql`
- Create `apps/api/prisma/data/vn-administrative-divisions-2025.json`
- Create `apps/api/prisma/seed-administrative-divisions.ts`
- Modify `apps/api/prisma/seed.ts`

1. Add global models:
   - `AdministrativeProvince`: `code` primary key, official `name`, `type`, `sortOrder`, `effectiveFrom`, timestamps.
   - `AdministrativeWard`: `code` primary key, `provinceCode` foreign key, official `name`, `type`, `sortOrder`, `effectiveFrom`, timestamps; index `(provinceCode, sortOrder)`.
2. Do not add `tenant_id` or RLS: these are shared government reference tables. Explicitly keep application roles read-only on the two tables (`SELECT` only); the seed runs through `MIGRATE_DATABASE_URL`.
3. Check in one deterministic fixture with metadata `{ document, effectiveFrom, provinceCount, wardCount }` and the complete official records. Expected counts are exactly 34 and 3,321.
4. Validate the fixture before writing: unique codes, two/five-digit formats, every ward references a known province, supported type values, exact expected counts.
5. Seed provinces before wards using idempotent upserts in bounded batches. Update names/types/order on rerun, create missing rows, and never download data during seeding.
6. Run the administrative seed before the optional `SEED_DEMO` branch. Update demo Partner `contactInfo` to the new code/snapshot shape so local data demonstrates the feature.

## Task 3: Implement the read-only NestJS module and APIs

**Files:**

- Create `apps/api/src/modules/administrative-division/domain/ports/administrative-division-repository.port.ts`
- Create `apps/api/src/modules/administrative-division/application/use-cases/list-provinces.use-case.ts`
- Create `apps/api/src/modules/administrative-division/application/use-cases/list-wards.use-case.ts`
- Create `apps/api/src/modules/administrative-division/infrastructure/repositories/prisma-administrative-division.repository.ts`
- Create `apps/api/src/modules/administrative-division/infrastructure/http/dto/administrative-division.dto.ts`
- Create `apps/api/src/modules/administrative-division/infrastructure/http/public-administrative-division.controller.ts`
- Create `apps/api/src/modules/administrative-division/infrastructure/http/administrative-division.module.ts`
- Modify `apps/api/src/app.module.ts`

1. Keep the controller thin: Zod DTO query validation → use case → contract response.
2. Query through the RLS-bound application client; because the tables are global and have no RLS, no `forTenant()` is used.
3. Select only response fields, filter wards by exact `provinceCode`, and order by stored `sortOrder` then `name`.
4. Export the address-resolution use case for synchronous Partner validation; Partner consumes the administrative module's application API, not its repository implementation.
5. Document both endpoints with Swagger DTOs and response arrays.

## Task 4: Validate and canonicalize location during Partner creation

**Files:**

- Modify `apps/api/src/modules/administrative-division/domain/ports/administrative-division-repository.port.ts`
- Create `apps/api/src/modules/administrative-division/application/use-cases/resolve-administrative-address.use-case.ts`
- Modify `apps/api/src/modules/administrative-division/infrastructure/http/administrative-division.module.ts`
- Modify `apps/api/src/modules/partner/application/use-cases/apply-as-partner.use-case.ts`
- Modify `apps/api/src/modules/partner/infrastructure/http/partner.module.ts`
- Modify `apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts` if generated Swagger metadata needs the stricter schema exposed explicitly

1. Resolve `{ provinceCode, wardCode }` before entering the Partner `forTenant()` transaction; this is a global read and avoids nesting/lengthening the tenant transaction.
2. Require one query to find a ward by both codes and include its province. Reject unknown or mismatched pairs with 400 code `INVALID_ADMINISTRATIVE_DIVISION`.
3. Ignore all client-supplied administrative names. Build the stored `contactInfo` server-side:

   ```json
   {
     "phone": "090...",
     "provinceCode": "79",
     "provinceName": "Thành phố Hồ Chí Minh",
     "provinceType": "municipality",
     "wardCode": "...",
     "wardName": "Phường ...",
     "wardType": "ward",
     "address": "12 Nguyễn Huệ"
   }
   ```

4. Keep Partner creation, membership, role assignment, and outbox emission in the existing single `forTenant()` transaction.

## Task 5: Wire dependent selectors into Storefront Partner onboarding

**Files:**

- Create `apps/storefront/app/lib/administrative-divisions.server.ts`
- Create `apps/storefront/app/routes/administrative-wards.tsx`
- Modify `apps/storefront/app/routes.ts`
- Modify `apps/storefront/app/lib/partner-onboarding.server.ts`
- Modify `apps/storefront/app/lib/partner-onboarding.server.spec.ts`
- Modify `apps/storefront/app/routes/partner-onboarding/profile.tsx`
- Add/update focused Storefront route/component tests near the changed files

1. Fetch and validate provinces from the API in `loadPartnerProfile`; return them with the existing email/tenant data.
2. Add a same-origin resource loader such as `/administrative-divisions/wards?provinceCode=79` that validates the query, calls the backend server-to-server, validates the response contract, and forwards cache headers.
3. Render province and ward as searchable shared `combobox` fields. Load wards with `useFetcher` when the selected province changes.
4. Disable the ward combobox until a province is selected; show a loading state while fetching; reset `wardCode` whenever `provinceCode` changes so a stale cross-province value cannot be submitted.
5. Remove the Quận/Huyện field and use labels `Tỉnh / Thành phố` and `Phường / Xã / Đặc khu`.
6. Map only codes, phone, and detailed address into `PartnerApplyInput`; names remain backend-owned.
7. Preserve current uploaded documents, bank fields, terms handling, error mapping, and BFF-only authenticated submission.

## Task 6: Integration coverage and seed verification

**Files:**

- Create `apps/api/test/administrative-division.integration.spec.ts`
- Modify `apps/api/test/partner.integration.spec.ts`
- Update Storefront tests identified in Task 5

1. After migrations + seed, assert exactly 34 provinces and 3,321 wards, including representative leading-zero codes and the expected effective date/source metadata.
2. Prove both public endpoints work without a session and wards never leak across provinces.
3. Prove malformed query input returns 400.
4. Prove Partner apply succeeds with a valid code pair and stores canonical code/name snapshots.
5. Prove unknown province, unknown ward, and a real ward paired with the wrong province each return `INVALID_ADMINISTRATIVE_DIVISION` and create no Partner/member/role/outbox rows.
6. Prove the Storefront payload no longer contains `district` or client-owned province/ward names.

## Task 7: Verification sequence

Run fresh, in this order:

```bash
pnpm --filter @booking/contracts test
pnpm --filter @booking/contracts typecheck
pnpm --filter @booking/api prisma:generate
pnpm --filter @booking/api typecheck
pnpm --filter @booking/api lint
pnpm --filter @booking/api test
pnpm --filter @booking/api test:integration
pnpm --filter @booking/storefront test
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront lint
pnpm --filter @booking/storefront build
pnpm build
git diff --check
```

Also run the seed twice against the same migrated database and verify the second run preserves the 34/3,321 counts without duplicates or drift.

## Acceptance criteria

- The Partner form contains no district field and cannot submit until a valid province and dependent ward are selected.
- The UI never uses a hard-coded province/ward array and never calls an external administrative API.
- The backend, not the browser, owns canonical administrative names and rejects tampered code pairs.
- Reference data is global, read-only to the application role, idempotently seeded, and available when `SEED_DEMO=false`.
- Existing legacy Partner rows remain readable; new Partner applications store the two-level official code/name snapshot.
- All contract, API, Storefront, integration, build, lint, and type-check commands pass.

## Explicit non-goals

- Backfilling free-text addresses on existing Partner rows.
- Migrating Listing/ListingGroup addresses or Storefront marketplace filters to administrative codes.
- Geocoding, latitude/longitude, maps, distance search, or address autocomplete below ward level.
- Automatic remote synchronization when future administrative decisions are issued; that should be a reviewed fixture/version update.

## Source of truth

- Decision `19/2025/QĐ-TTg`, effective `2025-07-01`: 34 province-level codes and 3,321 commune-level codes. Government summary: <https://xaydungchinhsach.chinhphu.vn/bang-danh-muc-va-ma-so-cua-34-tinh-thanh-moi-cac-don-vi-hanh-chinh-cap-xa-moi-11925070418263625.htm>
