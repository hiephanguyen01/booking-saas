# Demo Booking History and Home Carousel Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed StudioHub with durable demo bookings covering every customer history tab and show the four supplied images in the storefront home carousel.

**Architecture:** Extend the existing idempotent `seed.ts` fixtures rather than adding a second seed entrypoint. Store optimized carousel files beside the existing default storefront assets, upload them through `storage:init`, and derive the tenant theme URLs from `S3_PUBLIC_URL` so local MinIO and deployed object storage use the same paths.

**Tech Stack:** TypeScript, Prisma 7, PostgreSQL `tstzrange`, AWS S3 SDK/MinIO, React Router storefront theme contract, macOS `sips` for one-time image optimization.

## Global Constraints

- Do not create test files, test scripts, test configuration, or CI test steps.
- Do not change Prisma schema, migrations, backend APIs, storefront contracts, or database tables.
- Money remains integer VND (`bigint`); times remain UTC `timestamptz` values.
- Seed mutations run through the existing migration/admin Prisma client and affect only stable StudioHub fixture codes/idempotency keys.
- The seed must be safe to run repeatedly without duplicate bookings or status-history rows.
- Preserve the supplied image order: `img1`, `img2`, `img3`, `img4`.

---

### Task 1: Optimize and bootstrap the carousel assets

**Files:**
- Create: `apps/storefront/public/booking-studio/carousel/01.jpg`
- Create: `apps/storefront/public/booking-studio/carousel/02.jpg`
- Create: `apps/storefront/public/booking-studio/carousel/03.jpg`
- Create: `apps/storefront/public/booking-studio/carousel/04.jpg`
- Modify: `apps/api/scripts/bootstrap-storage.ts`

**Interfaces:**
- Consumes: the four user-supplied JPEGs under `/Users/hiephanguyen01/Downloads/es6-carousel-main/carousel-3/`.
- Produces: four public objects at `defaults/booking-studio/carousel/01.jpg` through `04.jpg`.

- [ ] **Step 1: Create the asset directory and generate web-sized JPEGs**

Use `sips` as a one-time asset build step. It preserves aspect ratio and composition while bounding the longest edge at 1800 px and applying JPEG quality 82.

```bash
mkdir -p apps/storefront/public/booking-studio/carousel
sips -Z 1800 -s format jpeg -s formatOptions 82 /Users/hiephanguyen01/Downloads/es6-carousel-main/carousel-3/img1.jpg --out apps/storefront/public/booking-studio/carousel/01.jpg
sips -Z 1800 -s format jpeg -s formatOptions 82 /Users/hiephanguyen01/Downloads/es6-carousel-main/carousel-3/img2.jpg --out apps/storefront/public/booking-studio/carousel/02.jpg
sips -Z 1800 -s format jpeg -s formatOptions 82 /Users/hiephanguyen01/Downloads/es6-carousel-main/carousel-3/img3.jpg --out apps/storefront/public/booking-studio/carousel/03.jpg
sips -Z 1800 -s format jpeg -s formatOptions 82 /Users/hiephanguyen01/Downloads/es6-carousel-main/carousel-3/img4.jpg --out apps/storefront/public/booking-studio/carousel/04.jpg
```

Expected: four JPEG files, each with maximum dimension 1800 px and materially smaller than its source.

- [ ] **Step 2: Add the four objects to the storage bootstrap manifest**

Extend `defaultAssets` in `apps/api/scripts/bootstrap-storage.ts` with explicit content types instead of assuming PNG for every object:

```ts
const defaultAssets = [
  {
    label: 'logo',
    key: 'defaults/booking-studio/logo.png',
    path: resolve(__dirname, '../../storefront/public/booking-studio/logo.png'),
    contentType: 'image/png',
  },
  // app icon and background keep contentType: 'image/png'
  ...[1, 2, 3, 4].map((index) => ({
    label: `carousel image ${index}`,
    key: `defaults/booking-studio/carousel/${String(index).padStart(2, '0')}.jpg`,
    path: resolve(
      __dirname,
      `../../storefront/public/booking-studio/carousel/${String(index).padStart(2, '0')}.jpg`,
    ),
    contentType: 'image/jpeg',
  })),
];
```

Change `PutObjectCommand` to use the manifest value:

```ts
ContentType: asset.contentType,
```

- [ ] **Step 3: Verify asset dimensions, MIME types, and TypeScript**

Run:

```bash
file apps/storefront/public/booking-studio/carousel/*.jpg
sips -g pixelWidth -g pixelHeight apps/storefront/public/booking-studio/carousel/*.jpg
pnpm --filter=@booking/api typecheck
```

Expected: all four files report JPEG, every width/height is at most 1800, and API typecheck exits 0.

- [ ] **Step 4: Commit the asset pipeline**

```bash
git add apps/storefront/public/booking-studio/carousel apps/api/scripts/bootstrap-storage.ts
git commit -m "feat(seed): add storefront carousel assets"
```

---

### Task 2: Make StudioHub carousel URLs deterministic

**Files:**
- Modify: `apps/api/prisma/seed.ts:103-125`

**Interfaces:**
- Consumes: the storage object keys produced by Task 1 and existing `storagePublicUrl` normalization.
- Produces: `studioHubTheme.carousel: string[]` with four ordered absolute URLs.

- [ ] **Step 1: Derive the four theme URLs from `S3_PUBLIC_URL`**

Add the ordered URLs next to the existing logo/background URL declarations:

```ts
const carouselUrls = Array.from(
  { length: 4 },
  (_, index) =>
    `${storagePublicUrl}/defaults/booking-studio/carousel/${String(index + 1).padStart(2, '0')}.jpg`,
);
```

Replace the one-slide theme value:

```ts
carousel: carouselUrls,
```

Keep the hero background unchanged.

- [ ] **Step 2: Verify the theme contract accepts the result**

Run:

```bash
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/storefront typecheck
```

Expected: both commands exit 0; no contract or schema changes are needed.

- [ ] **Step 3: Commit the theme seed update**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(seed): configure StudioHub home carousel"
```

---

### Task 3: Generalize the booking fixture helper for UI states

**Files:**
- Modify: `apps/api/prisma/seed.ts:817-867`

**Interfaces:**
- Produces: `seedBooking(input)` supporting `pending_payment | confirmed | completed | cancelled | no_show`, deterministic updates, monetary snapshots, and a supplied status-history chain.
- Consumes: existing Prisma client, UTC `Date` anchors, booking/listing/customer IDs, and cancellation-policy data.

- [ ] **Step 1: Expand the fixture input type**

Replace the current two-status input with:

```ts
type SeedBookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

type SeedBookingHistoryStep = {
  fromStatus: SeedBookingStatus | 'draft' | null;
  toStatus: SeedBookingStatus | 'draft';
  reason: string;
  createdAt: Date;
};

type SeedBookingInput = {
  tenantId: string;
  listingId: string;
  partnerId: string;
  resourceId: string;
  customerId: string;
  cancellationPolicyId: string;
  code: string;
  idempotencyKey: string;
  status: SeedBookingStatus;
  finalAmount: number;
  paidAmount: number;
  refundDueAmount?: number;
  refundPercent?: number;
  expiresAt?: Date;
  customerNote: string;
  createdAt: Date;
  startAt: Date;
  endAt: Date;
  history: SeedBookingHistoryStep[];
};
```

- [ ] **Step 2: Update or create the known fixture instead of returning early**

Build shared data with real snapshots:

```ts
const amount = BigInt(input.finalAmount);
const bookingData = {
  listingId: input.listingId,
  partnerId: input.partnerId,
  resourceId: input.resourceId,
  customerId: input.customerId,
  cancellationPolicyId: input.cancellationPolicyId,
  bookingMode: 'hourly' as const,
  status: input.status,
  totalAmount: amount,
  finalAmount: amount,
  depositAmount: amount / 2n,
  paidAmount: BigInt(input.paidAmount),
  refundDueAmount:
    input.refundDueAmount === undefined ? null : BigInt(input.refundDueAmount),
  refundPercent: input.refundPercent ?? null,
  expiresAt: input.expiresAt ?? null,
  customerNote: input.customerNote,
  cancellationPolicySnapshot: [
    { hoursBefore: 168, refundPercent: 100 },
    { hoursBefore: 48, refundPercent: 50 },
    { hoursBefore: 0, refundPercent: 0 },
  ],
  pricingSnapshot: {
    lineItems: [
      {
        label: 'Thuê Studio A — Hàn Quốc',
        quantity: 2,
        unitPrice: (amount / 2n).toString(),
        regularUnitPrice: (amount / 2n).toString(),
        amount: amount.toString(),
        regularAmount: amount.toString(),
      },
    ],
  },
  createdAt: input.createdAt,
};
```

Use `findFirst` by `(tenantId, idempotencyKey)`, then `update` or `create`. On update, also restore the stable `code`; this keeps reruns deterministic even if an earlier seed used stale dates or amounts.

```ts
const existing = await prisma.booking.findFirst({
  where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
});
const booking = existing
  ? await prisma.booking.update({
      where: { id: existing.id },
      data: { code: input.code, ...bookingData },
    })
  : await prisma.booking.create({
      data: {
        tenantId: input.tenantId,
        code: input.code,
        idempotencyKey: input.idempotencyKey,
        ...bookingData,
      },
    });
```

- [ ] **Step 3: Refresh ranges and fixture-owned history atomically enough for seed use**

After saving the booking, retain the existing parameterized raw range update:

```ts
await prisma.$executeRaw`
  UPDATE bookings
     SET timeslot = tstzrange(${input.startAt}::timestamptz, ${input.endAt}::timestamptz, '[)'),
         blocked_period = tstzrange(${input.startAt}::timestamptz, ${input.endAt}::timestamptz, '[)')
   WHERE id = ${booking.id}::uuid`;
```

Then replace only this booking's history:

```ts
await prisma.bookingStatusHistory.deleteMany({ where: { bookingId: booking.id } });
await prisma.bookingStatusHistory.createMany({
  data: input.history.map((step) => ({
    tenantId: input.tenantId,
    bookingId: booking.id,
    fromStatus: step.fromStatus,
    toStatus: step.toStatus,
    reason: step.reason,
    createdAt: step.createdAt,
  })),
});
```

- [ ] **Step 4: Run static verification**

Run:

```bash
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the reusable fixture helper**

```bash
git add apps/api/prisma/seed.ts
git commit -m "refactor(seed): support booking history states"
```

---

### Task 4: Seed all booking-history tab variants

**Files:**
- Modify: `apps/api/prisma/seed.ts:545-590`

**Interfaces:**
- Consumes: generalized `seedBooking` from Task 3, `cancelPolicy.id`, and existing time helpers.
- Produces: StudioHub customer history covering payment, upcoming, completed, cancelled, and no-show variants.

- [ ] **Step 1: Add a deterministic history builder**

Keep history timestamps derived from each booking's `createdAt`:

```ts
const minutesAfter = (value: Date, minutes: number) =>
  new Date(value.getTime() + minutes * 60 * 1000);

const bookingHistory = (
  createdAt: Date,
  finalStatus: SeedBookingStatus,
): SeedBookingHistoryStep[] => {
  const steps: SeedBookingHistoryStep[] = [
    { fromStatus: null, toStatus: 'draft', reason: 'seed booking created', createdAt },
  ];
  steps.push({
    fromStatus: 'draft',
    toStatus: 'pending_payment',
    reason: 'seed booking awaiting payment',
    createdAt: minutesAfter(createdAt, 5),
  });
  if (finalStatus === 'pending_payment') return steps;
  steps.push({
    fromStatus: 'pending_payment',
    toStatus: 'confirmed',
    reason: 'seed payment confirmed',
    createdAt: minutesAfter(createdAt, 10),
  });
  if (finalStatus === 'confirmed') return steps;
  steps.push({
    fromStatus: 'confirmed',
    toStatus: finalStatus,
    reason: `seed booking ${finalStatus}`,
    createdAt: minutesAfter(createdAt, 15),
  });
  return steps;
};
```

- [ ] **Step 2: Upgrade the existing health fixtures**

Pass `cancelPolicy.id`, `paidAmount`, notes, and histories into `BK-HEALTH01`, `BK-HEALTH02`, and `BK-HEALTH03`. Preserve their status roles and health-relative dates. Keep the review attached to `BK-HEALTH01`.

Use distinct future slots for blocking fixtures:

```ts
BK-HEALTH02: confirmed, daysFromNow(30) at 14:00-16:00
BK-DEMO-PAY: pending_payment, daysFromNow(31) at 09:00-11:00
```

- [ ] **Step 3: Add pending-payment, cancelled, and no-show fixtures**

Create three calls with stable identities:

```ts
{
  code: 'BK-DEMO-PAY',
  idempotencyKey: 'seed-demo-booking-payment',
  status: 'pending_payment',
  finalAmount: 900_000,
  paidAmount: 0,
  expiresAt: daysFromNow(1),
  createdAt: daysAgo(1),
  startAt: atHour(daysFromNow(31), 9),
  endAt: atHour(daysFromNow(31), 11),
}
{
  code: 'BK-DEMO-CANCEL',
  idempotencyKey: 'seed-demo-booking-cancelled',
  status: 'cancelled',
  finalAmount: 1_200_000,
  paidAmount: 600_000,
  refundDueAmount: 600_000,
  refundPercent: 100,
  createdAt: daysAgo(10),
  startAt: atHour(daysFromNow(12), 13),
  endAt: atHour(daysFromNow(12), 15),
}
{
  code: 'BK-DEMO-NOSHOW',
  idempotencyKey: 'seed-demo-booking-no-show',
  status: 'no_show',
  finalAmount: 750_000,
  paidAmount: 750_000,
  createdAt: daysAgo(5),
  startAt: atHour(daysAgo(2), 10),
  endAt: atHour(daysAgo(2), 12),
}
```

Supply a Vietnamese `customerNote` and `bookingHistory(createdAt, status)` for each call. Cancelled and no-show are terminal, so their ranges do not participate in the live-booking exclusion constraint.

- [ ] **Step 4: Update seed logging**

Change the final StudioHub log message from `health fixtures (3 bookings...)` to describe `booking-history fixtures covering 5 UI states` while retaining the overdue-payout and webhook-failure summary.

- [ ] **Step 5: Run static verification**

Run:

```bash
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the history fixtures**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(seed): cover customer booking history states"
```

---

### Task 5: Run idempotency and storefront acceptance checks

**Files:**
- Verify only; no test files or schema changes.

**Interfaces:**
- Consumes: local Postgres, MinIO, migrated schema, and the completed Tasks 1-4.
- Produces: evidence that the seed, storage objects, API build, and storefront presentation work together.

- [ ] **Step 1: Start local infrastructure and upload defaults**

Run:

```bash
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api storage:init
```

Expected: storage output lists four carousel objects at the configured public URL; migrations apply without errors.

- [ ] **Step 2: Run the seed twice**

Run twice:

```bash
pnpm --filter=@booking/api seed
pnpm --filter=@booking/api seed
```

Expected: both runs exit 0 without unique or GiST exclusion errors.

- [ ] **Step 3: Inspect deterministic database counts**

Use Prisma Studio or a read-only SQL query to confirm:

```sql
SELECT code, status, lower(timeslot), upper(timeslot), paid_amount, refund_due_amount
FROM bookings
WHERE code IN ('BK-HEALTH01', 'BK-HEALTH02', 'BK-HEALTH03',
               'BK-DEMO-PAY', 'BK-DEMO-CANCEL', 'BK-DEMO-NOSHOW')
ORDER BY code;

SELECT booking_id, count(*)
FROM booking_status_history
WHERE booking_id IN (SELECT id FROM bookings WHERE idempotency_key LIKE 'seed-%booking%')
GROUP BY booking_id;
```

Expected: one booking per code, dates match the second seed run's relative anchors, and history counts match each chain with no duplicated rows.

- [ ] **Step 4: Verify Storefront UI**

Run the API and storefront, log in as `customer@studiohub.vn`, then inspect `/vi` and `/en`:

- Home shows four carousel slides in `img1` → `img4` order with no broken requests.
- Booking history has data under payment, upcoming, completed, cancelled, and no-show tabs.
- The reviewed completed booking still shows its review; pending payment exposes Pay; confirmed exposes Cancel; cancelled shows refund; no-show shows no-refund/dispute content.
- Rerunning seed and refreshing keeps one copy of every fixture and moves relative upcoming dates forward.

- [ ] **Step 5: Run final verification suite**

Run:

```bash
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api build
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront build
git diff --check
```

Expected: every command exits 0. Existing Vite sourcemap warnings may appear, but neither frontend nor backend build may fail.

- [ ] **Step 6: Commit any acceptance-only corrections**

If acceptance checks required tracked corrections, stage only the files in this plan and commit:

```bash
git add apps/api/prisma/seed.ts apps/api/scripts/bootstrap-storage.ts apps/storefront/public/booking-studio/carousel
git commit -m "fix(seed): finalize demo booking fixtures"
```

If no tracked corrections were needed, do not create an empty commit.
