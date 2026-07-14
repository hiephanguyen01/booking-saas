# Storefront Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Storefront production build and fix the first set of confirmed correctness/security defects without changing `apps/api`.

**Architecture:** React Router route modules will own all server-only exports and imports, while feature page modules remain browser-safe. Small pure/server helpers will isolate redirect validation, tenant mapping, checkout idempotency, and public API failure semantics so each behavior can be driven by focused Vitest tests before the route refactor is verified by a production build.

**Tech Stack:** React Router Framework Mode 7.18.1 for this compatibility milestone, React 19.2.7 as currently locked, TypeScript, Vitest 3.2, native fetch temporarily (replaced by Axios in the later API-client milestone), pnpm, Turborepo.

## Global Constraints

- Do not modify `apps/api`.
- Do not implement or remove dark mode.
- Preserve the uncommitted user change in `apps/dashboard/app/routes/affiliate/_index.tsx`.
- Do not stage or commit unrelated files.
- Browser-reachable modules must not import `.server` modules.
- Route modules own `loader`, `action`, `meta`, headers, middleware, and boundaries.
- Feature page modules own render-only UI and browser-safe helpers.
- TypeScript remains strict; do not add `any`.
- Use pnpm `10.13.1` and package-level scripts registered through Turborepo.
- Keep the existing API endpoint shapes and Storefront URLs during this milestone.
- OTP URL removal is intentionally deferred to the Redis-backed BFF session milestone because the backend lookup OTP is single-use.

---

## File Structure for This Milestone

```text
apps/storefront/app/
├── architecture.spec.ts                    # browser/server boundary regression test
├── features/
│   ├── catalog/catalog-page.tsx             # catalog UI only
│   ├── listing/listing-page.tsx             # listing UI only
│   └── checkout/checkout-page.tsx           # checkout UI only
├── lib/
│   ├── checkout-idempotency.server.ts       # stable hashed idempotency key
│   ├── checkout-idempotency.server.spec.ts
│   ├── public-api.server.ts                 # temporary fetch transport failure semantics
│   ├── public-api.server.spec.ts
│   ├── safe-redirect.ts                     # same-origin path validation
│   ├── safe-redirect.spec.ts
│   ├── tenant-mapper.ts                     # DTO → StorefrontTenant mapping
│   └── tenant-mapper.spec.ts
└── routes/
    ├── catalog.tsx                          # route exports + CatalogPage adapter
    ├── listing.tsx                          # route exports + ListingPage adapter
    ├── checkout.tsx                         # route exports + CheckoutPage adapter
    └── set-locale.tsx                       # safe redirect consumer
```

The obsolete feature barrels `features/{catalog,listing,checkout,booking,partner}/index.ts`
are deleted after all route imports point at focused modules.

---

### Task 1: Add the Storefront Test Harness and Browser-Boundary Regression

**Files:**
- Modify: `apps/storefront/package.json`
- Modify: `turbo.json`
- Create: `apps/storefront/app/architecture.spec.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Node file-system APIs and the existing `apps/storefront/app/features` tree.
- Produces: Storefront `test` script and a regression that fails whenever a feature module imports a `.server` module.

- [ ] **Step 1: Add the focused test script and direct Vitest dependency**

Update `apps/storefront/package.json` scripts and dev dependencies:

```json
{
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "start": "react-router-serve ./build/server/index.js",
    "lint": "eslint app",
    "typecheck": "react-router typegen && tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.2.0"
  }
}
```

Keep all existing dependencies. Run:

```bash
pnpm install --lockfile-only
```

Expected: `pnpm-lock.yaml` records Vitest as a direct Storefront dev dependency without changing application source.

- [ ] **Step 2: Register test output semantics in Turborepo**

Change the root `turbo.json` test task to:

```json
"test": {
  "dependsOn": ["^build"],
  "outputs": ["coverage/**"]
}
```

- [ ] **Step 3: Write the failing architecture test**

Create `apps/storefront/app/architecture.spec.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

describe('Storefront feature boundaries', () => {
  it('keeps server-only imports out of browser-reachable feature modules', () => {
    const featureRoot = join(process.cwd(), 'app', 'features');
    const violations = sourceFiles(featureRoot)
      .filter((path) => /from\s+['"][^'"]+\.server['"]/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(process.cwd().length + 1));

    expect(violations).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test and verify RED**

Run:

```bash
pnpm --filter @booking/storefront test -- app/architecture.spec.ts
```

Expected: FAIL listing at least the current catalog, listing, checkout, booking, and partner feature modules that expose `.server` imports.

- [ ] **Step 5: Confirm the existing production build failure**

Run:

```bash
pnpm --filter @booking/storefront build
```

Expected: FAIL with `Server-only module referenced by client` from `features/checkout/index.ts`.

- [ ] **Step 6: Commit the red regression harness**

```bash
git add apps/storefront/package.json apps/storefront/app/architecture.spec.ts turbo.json pnpm-lock.yaml
git commit -m "test(storefront): guard browser and server module boundaries"
```

---

### Task 2: Move Server Exports into React Router Route Modules

**Files:**
- Rename: `apps/storefront/app/features/catalog/catalog.tsx` → `apps/storefront/app/features/catalog/catalog-page.tsx`
- Rename: `apps/storefront/app/features/listing/listing.tsx` → `apps/storefront/app/features/listing/listing-page.tsx`
- Rename: `apps/storefront/app/features/checkout/checkout.tsx` → `apps/storefront/app/features/checkout/checkout-page.tsx`
- Modify: `apps/storefront/app/routes/catalog.tsx`
- Modify: `apps/storefront/app/routes/listing.tsx`
- Modify: `apps/storefront/app/routes/checkout.tsx`
- Delete: `apps/storefront/app/features/catalog/index.ts`
- Delete: `apps/storefront/app/features/listing/index.ts`
- Delete: `apps/storefront/app/features/checkout/index.ts`
- Delete: `apps/storefront/app/features/booking/index.ts`
- Delete: `apps/storefront/app/features/partner/index.ts`

**Interfaces:**
- Consumes: existing `fetchListingTypes`, `fetchListings`, `fetchListing`, `fetchQuote`, `fetchAvailability`, booking mutations, affiliate attribution, tenant resolution, and recent-booking cookie helpers.
- Produces: `CatalogPage`, `ListingPage`, and `CheckoutPage` render-only components plus canonical route exports.

- [ ] **Step 1: Rename the three UI modules**

Use `apply_patch` to add each `*-page.tsx` file with the current source, then delete
the old filename in the same patch. This preserves the user's working tree and
keeps every source mutation reviewable.

- [ ] **Step 2: Make `catalog-page.tsx` render-only**

Remove the imports of `fetchListings` and `fetchListingTypes`, and remove the `meta` and `loader` exports. Keep the existing JSX and helper components. Rename the default component:

```tsx
export function CatalogPage({ loaderData, params }: Route.ComponentProps) {
  const { type, listings } = loaderData;
  const [searchParams] = useSearchParams();
  const i18n = useT();
  const { t } = i18n;

  if (!type) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24 text-center text-muted-foreground">
        {t('catalog.typeNotFound', { slug: params.typeSlug })}
      </div>
    );
  }

  const Icon = typeIcon(type.slug);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{type.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t('catalog.resultsCount', { count: listings.length })}
          </p>
        </div>
      </div>

      {type.attributeSchema.length > 0 ? (
        <FilterBar fields={type.attributeSchema} searchParams={searchParams} i18n={i18n} />
      ) : null}

      {listings.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          {t('catalog.empty')}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
```

The only reference to `Route` is the erased type import:

```ts
import type { Route } from '../../routes/+types/catalog';
```

- [ ] **Step 3: Implement the canonical Catalog route module**

Replace `apps/storefront/app/routes/catalog.tsx` with:

```tsx
import type { Route } from './+types/catalog';
import { CatalogPage } from '../features/catalog/catalog-page';
import { fetchListingTypes, fetchListings } from '../lib/catalog.server';

export function meta({ params }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: params.typeSlug }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const search = new URLSearchParams(new URL(request.url).searchParams);
  search.set('type', params.typeSlug);

  const [types, listings] = await Promise.all([
    fetchListingTypes(request),
    fetchListings(request, search),
  ]);

  return {
    type: types.find((item) => item.slug === params.typeSlug) ?? null,
    listings,
  };
}

export default function CatalogRoute(props: Route.ComponentProps) {
  return <CatalogPage {...props} />;
}
```

- [ ] **Step 4: Make `listing-page.tsx` render-only**

Remove imports of `fetchListing`, `fetchQuote`, `fetchAvailability`, `addDays`,
`todayInTz`, and `DEFAULT_TZ`. Remove `BOOKABLE_MODES`, `pickMode`, `meta`, and
`loader`. Keep all existing render helpers and rename the component:

```tsx
export function ListingPage({ loaderData, params }: Route.ComponentProps) {
  const { listing, mode, availability, quote } = loaderData;
  const { t } = useT();

  if (!listing) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center text-muted-foreground">
        {t('listing.notFound', { slug: params.listingSlug })}
      </div>
    );
  }

  const attrs = Object.entries(listing.attributes).filter(
    ([, value]) => value !== null && value !== '' && typeof value !== 'boolean',
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{listing.title}</h1>
        {attrs.length > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {attrs.map(([, value]) => String(value)).join(' · ')}
          </p>
        ) : null}
        <TrustSignals trust={listing.trust} />
      </div>
      <Gallery photos={listing.photos} title={listing.title} />
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_400px]">
        <div>
          {listing.description ? (
            <p className="text-[15px] leading-relaxed text-foreground">{listing.description}</p>
          ) : null}
          {attrs.length > 0 ? <ListingAttributes attrs={attrs} /> : null}
        </div>
        <div>
          <BookingPanel listing={listing} mode={mode} availability={availability} quote={quote} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement the canonical Listing route module**

Replace `apps/storefront/app/routes/listing.tsx` with the existing listing loader logic moved into this route. Use this route shell and retain the current availability/quote branches verbatim:

```tsx
import type { AvailabilityMode, PublicListingDetailResponse } from '@booking/contracts';
import type { Route } from './+types/listing';
import { ListingPage } from '../features/listing/listing-page';
import { fetchAvailability } from '../lib/booking.server';
import { fetchListing, fetchQuote } from '../lib/catalog.server';
import { addDays, DEFAULT_TZ, todayInTz } from '../lib/time';

const BOOKABLE_MODES: AvailabilityMode[] = ['hourly', 'daily', 'inventory'];

function pickMode(
  requested: string | null,
  listing: PublicListingDetailResponse,
): AvailabilityMode {
  const enabled = listing.bookingModes.filter((mode): mode is AvailabilityMode =>
    BOOKABLE_MODES.includes(mode as AvailabilityMode),
  );

  if (requested && enabled.includes(requested as AvailabilityMode)) {
    return requested as AvailabilityMode;
  }

  return enabled[0] ?? 'hourly';
}

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const listing = loaderData?.listing;
  if (!listing) return [{ title: 'Listing' }];

  const description = listing.description?.slice(0, 200);
  const image = listing.photos[0];
  const tags: Route.MetaDescriptors = [
    { title: listing.title },
    { property: 'og:title', content: listing.title },
    { property: 'og:type', content: 'product' },
  ];

  if (description) {
    tags.push({ name: 'description', content: description });
    tags.push({ property: 'og:description', content: description });
  }

  if (image) tags.push({ property: 'og:image', content: image });
  return tags;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const searchParams = new URL(request.url).searchParams;
  const listing = await fetchListing(request, params.listingSlug);

  if (!listing) {
    throw new Response('Listing not found', { status: 404 });
  }

  const mode = pickMode(searchParams.get('mode'), listing);
  const today = todayInTz(DEFAULT_TZ);
  const availabilityPromise = mode === 'hourly'
    ? fetchAvailability(request, params.listingSlug, {
        mode,
        from: searchParams.get('day') || today,
        to: searchParams.get('day') || today,
      })
    : mode === 'daily'
      ? fetchAvailability(request, params.listingSlug, {
          mode,
          from: searchParams.get('from') || today,
          to: addDays(searchParams.get('from') || today, 30),
        })
      : fetchAvailability(request, params.listingSlug, {
          mode,
          from: (searchParams.get('from') || today).slice(0, 10),
          to: (searchParams.get('to') || searchParams.get('from') || today).slice(0, 10),
        });

  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const quantity = searchParams.get('qty') || '1';
  const quotePromise = start && end
    ? fetchQuote(
        request,
        params.listingSlug,
        new URLSearchParams({ mode, from: start, to: end, quantity }),
      )
    : Promise.resolve(null);

  const [availability, quote] = await Promise.all([availabilityPromise, quotePromise]);
  return { listing, mode, availability, quote };
}

export default function ListingRoute(props: Route.ComponentProps) {
  return <ListingPage {...props} />;
}
```

- [ ] **Step 6: Make `checkout-page.tsx` render-only**

Keep the existing render component and helpers from `subtractDeposit` downward.
Remove `data`, `redirect`, all `.server` imports, `meta`, `loader`, `GuestFields`,
`validateGuest`, and `action`. Retain `Form`, `Link`, and `useSearchParams` imports.
Rename the component:

```tsx
export function CheckoutPage({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, mode, start, end, qty, quote, promoCode, promo } = loaderData;

  // Copy the current JSX body beginning at the existing `if (!listing)` branch
  // through the component's closing return without changing markup or behavior.
}
```

- [ ] **Step 7: Implement the canonical Checkout route module**

Replace `apps/storefront/app/routes/checkout.tsx` with the existing checkout
`meta`, `loader`, validation, and `action` logic moved from the feature module.
Import `CheckoutPage` directly and finish with:

```tsx
export default function CheckoutRoute(props: Route.ComponentProps) {
  return <CheckoutPage {...props} />;
}
```

The route module is the only checkout browser entry allowed to import:

```ts
import { readRefCode } from '../lib/affiliate.server';
import {
  checkoutBooking,
  createBooking,
  validatePromo,
} from '../lib/booking.server';
import { fetchListing, fetchQuote } from '../lib/catalog.server';
import { appendRecentCookie } from '../lib/recent.server';
import { resolveTenant } from '../lib/tenant.server';
```

- [ ] **Step 8: Delete obsolete feature barrels**

Delete the five `features/*/index.ts` files listed in this task. Confirm no caller imports them:

```bash
rg -n "features/(catalog|listing|checkout|booking|partner)(['\"]|/index)" apps/storefront/app
```

Expected: no result.

- [ ] **Step 9: Run the architecture test and verify GREEN**

```bash
pnpm --filter @booking/storefront test -- app/architecture.spec.ts
```

Expected: PASS.

- [ ] **Step 10: Run typecheck and production build**

```bash
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront build
```

Expected: both PASS and no `Server-only module referenced by client` diagnostic.

- [ ] **Step 11: Commit the route boundary fix**

```bash
git add apps/storefront/app/features apps/storefront/app/routes/catalog.tsx apps/storefront/app/routes/listing.tsx apps/storefront/app/routes/checkout.tsx
git commit -m "refactor(storefront): isolate server code in route modules"
```

---

### Task 3: Fix Redirect, Favicon, and Checkout Idempotency Correctness

**Files:**
- Create: `apps/storefront/app/lib/safe-redirect.spec.ts`
- Create: `apps/storefront/app/lib/safe-redirect.ts`
- Modify: `apps/storefront/app/routes/set-locale.tsx`
- Create: `apps/storefront/app/lib/tenant-mapper.spec.ts`
- Create: `apps/storefront/app/lib/tenant-mapper.ts`
- Modify: `apps/storefront/app/lib/tenant.server.ts`
- Create: `apps/storefront/app/lib/checkout-idempotency.server.spec.ts`
- Create: `apps/storefront/app/lib/checkout-idempotency.server.ts`
- Modify: `apps/storefront/app/routes/checkout.tsx`

**Interfaces:**
- Produces: `safeRedirectPath(value, fallback)`, `toStorefrontTenant(dto)`, and `buildCheckoutIdempotencyKey(input)`.
- Consumes: `PublicTenantResponse`, the Storefront theme sanitizer, Node `createHash`, and checkout action data.

- [ ] **Step 1: Write failing safe-redirect tests**

Create `apps/storefront/app/lib/safe-redirect.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it.each(['//evil.example', '/\\evil.example', 'https://evil.example/path', 'javascript:alert(1)'])(
    'rejects external target %s',
    (value) => {
      expect(safeRedirectPath(value, '/')).toBe('/');
    },
  );

  it('preserves a same-origin path, query, and hash', () => {
    expect(safeRedirectPath('/bookings?status=pending#top', '/')).toBe(
      '/bookings?status=pending#top',
    );
  });

  it('uses the fallback for non-string values', () => {
    expect(safeRedirectPath(null, '/fallback')).toBe('/fallback');
  });
});
```

- [ ] **Step 2: Verify safe-redirect RED**

```bash
pnpm --filter @booking/storefront test -- app/lib/safe-redirect.spec.ts
```

Expected: FAIL because `./safe-redirect` does not exist.

- [ ] **Step 3: Implement safe redirect validation**

Create `apps/storefront/app/lib/safe-redirect.ts`:

```ts
const INTERNAL_ORIGIN = 'https://storefront.invalid';

export function safeRedirectPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  if (value.startsWith('/\\')) return fallback;

  try {
    const target = new URL(value, INTERNAL_ORIGIN);
    if (target.origin !== INTERNAL_ORIGIN) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
```

Use it in `routes/set-locale.tsx`:

```ts
const redirectTo = safeRedirectPath(form.get('redirectTo'));
```

- [ ] **Step 4: Verify safe-redirect GREEN**

```bash
pnpm --filter @booking/storefront test -- app/lib/safe-redirect.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing tenant favicon mapper test**

Create `apps/storefront/app/lib/tenant-mapper.spec.ts` with a complete minimal DTO fixture matching `PublicTenantResponse` and this assertion:

```ts
import { describe, expect, it } from 'vitest';
import type { PublicTenantResponse } from '@booking/contracts';
import { toStorefrontTenant } from './tenant-mapper';

describe('toStorefrontTenant', () => {
  it('reads faviconUrl from the top level of themeConfig', () => {
    const tenant = {
      id: 'tenant-1',
      name: 'Studio One',
      slug: 'studio-one',
      defaultLocale: 'vi',
      vertical: 'studio',
      live: true,
      themeConfig: {
        faviconUrl: 'https://cdn.example/favicon.ico',
      },
    } as PublicTenantResponse;

    expect(toStorefrontTenant(tenant).faviconUrl).toBe(
      'https://cdn.example/favicon.ico',
    );
  });
});
```

- [ ] **Step 6: Verify tenant mapper RED**

```bash
pnpm --filter @booking/storefront test -- app/lib/tenant-mapper.spec.ts
```

Expected: FAIL because `tenant-mapper.ts` does not exist.

- [ ] **Step 7: Extract and fix the tenant mapper**

Move `StorefrontTenant`, `DEFAULT_THEME`, `readTheme`, `readStr`, and
`toStorefrontTenant` from `tenant.server.ts` into `tenant-mapper.ts`. Export the
type and mapper, keep helper functions private, and map:

```ts
const favicon =
  typeof config.faviconUrl === 'string' && config.faviconUrl !== ''
    ? config.faviconUrl
    : null;

return {
  // existing fields
  logoUrl: logo,
  faviconUrl: favicon,
  // existing fields
};
```

`tenant.server.ts` imports and re-exports the type:

```ts
import { toStorefrontTenant, type StorefrontTenant } from './tenant-mapper';
export type { StorefrontTenant } from './tenant-mapper';
```

- [ ] **Step 8: Verify tenant mapper GREEN**

```bash
pnpm --filter @booking/storefront test -- app/lib/tenant-mapper.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Write failing checkout idempotency tests**

Create `apps/storefront/app/lib/checkout-idempotency.server.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCheckoutIdempotencyKey } from './checkout-idempotency.server';

const base = {
  tenantId: 'tenant-1',
  listingId: 'listing-1',
  mode: 'daily',
  start: '2026-08-01T00:00:00.000Z',
  end: '2026-08-02T00:00:00.000Z',
  quantity: 1,
  promoCode: null,
  email: 'Guest@Example.com ',
  phone: '0900000000',
};

describe('buildCheckoutIdempotencyKey', () => {
  it('is stable for equivalent normalized input', () => {
    expect(buildCheckoutIdempotencyKey(base)).toBe(
      buildCheckoutIdempotencyKey({ ...base, email: 'guest@example.com' }),
    );
  });

  it.each([
    { end: '2026-08-03T00:00:00.000Z' },
    { quantity: 2 },
    { promoCode: 'SUMMER' },
    { tenantId: 'tenant-2' },
  ])('changes when booking identity changes: %o', (change) => {
    expect(buildCheckoutIdempotencyKey({ ...base, ...change })).not.toBe(
      buildCheckoutIdempotencyKey(base),
    );
  });
});
```

- [ ] **Step 10: Verify idempotency RED**

```bash
pnpm --filter @booking/storefront test -- app/lib/checkout-idempotency.server.spec.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 11: Implement the stable hashed key**

Create `apps/storefront/app/lib/checkout-idempotency.server.ts`:

```ts
import { createHash } from 'node:crypto';

export interface CheckoutIdempotencyInput {
  tenantId: string;
  listingId: string;
  mode: string;
  start: string;
  end: string;
  quantity: number;
  promoCode: string | null;
  email: string;
  phone: string;
}

export function buildCheckoutIdempotencyKey(input: CheckoutIdempotencyInput): string {
  const canonical = JSON.stringify({
    tenantId: input.tenantId,
    listingId: input.listingId,
    mode: input.mode,
    start: input.start,
    end: input.end,
    quantity: input.quantity,
    promoCode: input.promoCode?.trim().toUpperCase() || null,
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
  });

  return `checkout:${createHash('sha256').update(canonical).digest('hex')}`;
}
```

In the checkout action, replace the old `co:` string with:

```ts
const idempotencyKey = buildCheckoutIdempotencyKey({
  tenantId: tenant.id,
  listingId,
  mode,
  start,
  end,
  quantity: qty,
  promoCode: promoCode ?? null,
  email: guest.data.email,
  phone: guest.data.phone,
});

const created = await createBooking(request, input, idempotencyKey);
```

- [ ] **Step 12: Verify idempotency GREEN and run the focused suite**

```bash
pnpm --filter @booking/storefront test -- app/lib/safe-redirect.spec.ts app/lib/tenant-mapper.spec.ts app/lib/checkout-idempotency.server.spec.ts
```

Expected: PASS.

- [ ] **Step 13: Run Storefront typecheck and build**

```bash
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront build
```

Expected: PASS.

- [ ] **Step 14: Commit correctness fixes**

```bash
git add apps/storefront/app/lib apps/storefront/app/routes/set-locale.tsx apps/storefront/app/routes/checkout.tsx
git commit -m "fix(storefront): secure redirects and booking identity"
```

---

### Task 4: Stop Collapsing Public API Failures into Empty Data

**Files:**
- Create: `apps/storefront/app/lib/public-api.server.spec.ts`
- Create: `apps/storefront/app/lib/public-api.server.ts`
- Modify: `apps/storefront/app/lib/catalog.server.ts`
- Modify: `apps/storefront/app/lib/booking.server.ts`

**Interfaces:**
- Produces: `requestPublicJson<T>(request, path, options)` returning parsed data or `null` only for explicitly allowed 404 responses.
- Consumes: `BACKEND_URL`, forwarded tenant host, `request.signal`, and an injectable fetch implementation for tests.

- [ ] **Step 1: Write failing public API behavior tests**

Create `apps/storefront/app/lib/public-api.server.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { requestPublicJson } from './public-api.server';

const request = new Request('https://storefront.example/vi', {
  headers: { host: 'storefront.example' },
});

describe('requestPublicJson', () => {
  it('returns successful JSON data', async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({ items: [] }, { status: 200 }),
    ) as typeof fetch;

    await expect(
      requestPublicJson<{ items: unknown[] }>(request, '/public/items', {
        fetchImplementation,
      }),
    ).resolves.toEqual({ items: [] });
  });

  it('returns null only for an explicitly allowed 404', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response('missing', { status: 404 }),
    ) as typeof fetch;

    await expect(
      requestPublicJson(request, '/public/items/missing', {
        allowNotFound: true,
        fetchImplementation,
      }),
    ).resolves.toBeNull();
  });

  it('maps an upstream 500 to a 503 route response', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response('failed', { status: 500 }),
    ) as typeof fetch;

    await expect(
      requestPublicJson(request, '/public/items', { fetchImplementation }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('maps malformed successful JSON to 502', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response('{', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;

    await expect(
      requestPublicJson(request, '/public/items', { fetchImplementation }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('maps network errors to 503', async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new TypeError('connection refused');
    }) as typeof fetch;

    await expect(
      requestPublicJson(request, '/public/items', { fetchImplementation }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
```

- [ ] **Step 2: Verify public API RED**

```bash
pnpm --filter @booking/storefront test -- app/lib/public-api.server.spec.ts
```

Expected: FAIL because `public-api.server.ts` does not exist.

- [ ] **Step 3: Implement the temporary public transport helper**

Create `apps/storefront/app/lib/public-api.server.ts`:

```ts
export interface PublicJsonOptions {
  allowNotFound?: boolean;
  fetchImplementation?: typeof fetch;
}

const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

function forwardedHost(request: Request): string {
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
}

export async function requestPublicJson<T>(
  request: Request,
  path: string,
  options: PublicJsonOptions = {},
): Promise<T | null> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  let response: Response;

  try {
    response = await fetchImplementation(`${backendUrl()}${path}`, {
      headers: {
        'x-forwarded-host': forwardedHost(request),
        accept: 'application/json',
      },
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    throw new Response('Storefront API unavailable', { status: 503 });
  }

  if (response.status === 404 && options.allowNotFound) return null;

  if (!response.ok) {
    throw new Response('Storefront API request failed', {
      status: response.status >= 500 ? 503 : response.status,
    });
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Response('Storefront API returned invalid JSON', { status: 502 });
  }
}
```

This helper is deliberately small and temporary. Runtime Zod validation and Axios
error categories replace it in the API-client milestone.

- [ ] **Step 4: Verify public API GREEN**

```bash
pnpm --filter @booking/storefront test -- app/lib/public-api.server.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Migrate catalog reads to explicit semantics**

Replace the four `try/catch` implementations in `catalog.server.ts` with calls to
`requestPublicJson`:

```ts
export async function fetchListingTypes(
  request: Request,
): Promise<PublicListingTypeResponse[]> {
  return (
    (await requestPublicJson<PublicListingTypeResponse[]>(request, '/public/listing-types')) ?? []
  );
}

export async function fetchListings(
  request: Request,
  search: URLSearchParams,
): Promise<PublicListingResponse[]> {
  const query = search.toString();
  return (
    (await requestPublicJson<PublicListingResponse[]>(
      request,
      `/public/listings${query ? `?${query}` : ''}`,
    )) ?? []
  );
}

export function fetchListing(
  request: Request,
  slug: string,
): Promise<PublicListingDetailResponse | null> {
  return requestPublicJson<PublicListingDetailResponse>(
    request,
    `/public/listings/${encodeURIComponent(slug)}`,
    { allowNotFound: true },
  );
}

export function fetchQuote(
  request: Request,
  slug: string,
  query: URLSearchParams,
): Promise<QuoteResponse | null> {
  return requestPublicJson<QuoteResponse>(
    request,
    `/public/listings/${encodeURIComponent(slug)}/quote?${query.toString()}`,
    { allowNotFound: true },
  );
}
```

- [ ] **Step 6: Migrate booking GET reads to explicit semantics**

Delete `getJson`, import `requestPublicJson`, then replace the three callers exactly:

```ts
export function fetchAvailability(
  request: Request,
  slug: string,
  query: { mode: AvailabilityMode; from: string; to: string },
): Promise<AvailabilityResponse> {
  const qs = new URLSearchParams(query).toString();
  return requestPublicJson<AvailabilityResponse>(
    request,
    `/public/listings/${encodeURIComponent(slug)}/availability?${qs}`,
  );
}

export function fetchBookingByCode(
  request: Request,
  code: string,
  otp?: string,
): Promise<BookingResponse | null> {
  const qs = otp ? `?otp=${encodeURIComponent(otp)}` : '';
  return requestPublicJson<BookingResponse>(
    request,
    `/public/bookings/${encodeURIComponent(code)}${qs}`,
    { allowNotFound: true },
  );
}

export function fetchPaymentStatus(
  request: Request,
  code: string,
): Promise<PaymentStatusResponse | null> {
  return requestPublicJson<PaymentStatusResponse>(
    request,
    `/public/bookings/${encodeURIComponent(code)}/payment-status`,
    { allowNotFound: true },
  );
}
```

Availability failures must throw instead of rendering a fake empty state. Booking
and payment-status 404s remain nullable because those routes already render an
explicit not-found/pending state. Preserve mutation result handling until the
Axios/Zod migration.

- [ ] **Step 7: Run focused and full Storefront verification**

```bash
pnpm --filter @booking/storefront test
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront lint
pnpm --filter @booking/storefront build
```

Expected: all PASS.

- [ ] **Step 8: Commit API failure semantics**

```bash
git add apps/storefront/app/lib
git commit -m "fix(storefront): preserve public API failure semantics"
```

---

### Task 5: Milestone Verification and Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-14-storefront-foundation.md`

**Interfaces:**
- Consumes: all Task 1–4 outputs.
- Produces: a checked-off plan and a verified baseline for the React Router 8 upgrade plan.

- [ ] **Step 1: Run architecture scans**

```bash
rg -n "\.server" apps/storefront/app/features -g '*.{ts,tsx}'
rg -n "export \{ default, loader|export \{ default, loader, action" apps/storefront/app/features -g '*.ts'
```

Expected: no output.

- [ ] **Step 2: Run Storefront verification**

```bash
pnpm --filter @booking/storefront test
pnpm --filter @booking/storefront typecheck
pnpm --filter @booking/storefront lint
pnpm --filter @booking/storefront build
```

Expected: all commands exit 0.

- [ ] **Step 3: Run shared-package regressions affected by imports**

```bash
pnpm --filter @booking/contracts test
pnpm --filter @booking/contracts typecheck
pnpm --filter @booking/ui typecheck
```

Expected: all commands exit 0.

- [ ] **Step 4: Confirm unrelated worktree changes remain untouched**

```bash
git status --short
git diff -- apps/dashboard/app/routes/affiliate/_index.tsx
```

Expected: the user's Affiliate diff remains present and unstaged; only the plan
checkbox update may remain from this task.

- [ ] **Step 5: Mark completed checkboxes and commit the milestone record**

Use `apply_patch` to change completed `- [ ]` entries in this plan to `- [x]`, then:

```bash
git add docs/superpowers/plans/2026-07-14-storefront-foundation.md
git commit -m "docs: record storefront foundation verification"
```

- [ ] **Step 6: Proceed to the separate React Router 8 upgrade plan**

The next plan must begin from this verified Storefront/Dashboard build baseline and
must not combine dependency migration with auth middleware implementation.
