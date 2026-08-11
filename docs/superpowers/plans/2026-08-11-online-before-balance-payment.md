# Online-Before Balance Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer pay the outstanding balance of a confirmed deposit booking online, so
`balance_due = online_before` finally means something.

**Architecture:** A second gateway payment against an already-confirmed booking. The checkout use-case
gains a *balance* branch beside its existing *deposit* branch; the `payment.succeeded` handler adds to
`paid_amount` instead of re-confirming; and the held-settlement writer increments
`online_held_amount` instead of no-oping. No schema change, no scheduler, no new module.

**Tech Stack:** NestJS 11 (hexagonal, no service classes), Prisma, React Router 8 storefront,
`@booking/contracts` zod schemas.

## Global Constraints

- **NO TESTS, ever** (AGENTS.md hard rule 1 / ADR 0005). Verification is `typecheck` + `lint` + `build`
  + running the app. Every "verify" step below reflects that.
- Backend flow is **`controller → use-case → repository-port → repository`**. No service classes.
- **One use-case = one file**, one exported `@Injectable XxxUseCase`, one public `execute()`.
- Money is `bigint` VND đồng. Entities are framework-free: no Nest, no Prisma, no clock.
- Storefront never fetches the backend from the browser — the button posts to a route `action`.
- `@booking/contracts` must be rebuilt (`pnpm --filter=@booking/contracts build`) before consumers
  see a schema change.

## Why this is needed (the defect being fixed)

`studio-a-han-quoc` costs 280,000 ₫ with `deposit_percent = 50`, `balance_due = online_before`:

1. Checkout takes 140,000 ₫ and the payment entity labels it `kind: 'deposit'` — the code *knows* it
   took a part payment.
2. The booking flips `pending_payment → confirmed`.
3. The customer's page displays **"Còn lại phải thanh toán: 140.000 ₫"** — and offers only *Hủy đơn*.
4. `Payment.assertPayable` (`payment.entity.ts:30`) refuses any payment unless the booking is
   `pending_payment`, so no second payment can ever exist.

Measured consequence (`2026-08-11-money-flow-results.md`): a `balance_due = online_before` booking and
an `on_arrival` one produce **identical** money to the đồng, because both end with the partner
collecting cash. **80 of BookingStudio's 120 listings are configured `online_before`.**

## Decisions locked before implementation

1. **No hard deadline.** The balance stays payable until the booking is completed or cancelled. If it
   is still unpaid when the service happens, the partner collects on site exactly as today —
   `planCompletion` already asserts `onsiteCollectedAmount == finalAmount + additionalCharges −
   paidAmount`, which is simply `0` once the balance is paid. This needs no scheduler and cannot strand
   a booking. A payment *reminder* is a separate follow-up, not this plan.
2. **The settlement keeps the deposit's `payment_id`.** `booking_settlements.payment_id` is `@unique`
   and one settlement serves one booking, so a balance payment increments `online_held_amount` and
   leaves `payment_id` pointing at the deposit. **Consequence to accept knowingly:** an automatic
   gateway refund can only be issued against the deposit payment's transaction; a refund larger than
   the deposit falls to the existing `manual_required` flow. That is already the norm — SePay has no
   refund API (`TONG-QUAN.md` §risk 1) — so this is not a regression, but it must be written down.
3. **`paid_amount` accumulates.** Confirmation *sets* it to `depositAmount`
   (`booking.entity.ts:161`); a balance payment must **add**, never overwrite.
4. **Balance = `final_amount − paid_amount`.** `additional_charges` accrue at completion, after the
   service, so they are deliberately not payable through this flow.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/api/src/modules/payments/domain/entities/payment.entity.ts` | *Modify.* `assertBalancePayable`, `planBalance` — pure decisions, beside the existing `assertPayable`/`plan`. |
| `apps/api/src/modules/payments/domain/errors/payment-errors.ts` | *Modify.* `NothingLeftToPay` (409). |
| `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts` | *Modify.* Branch deposit vs balance; everything downstream (gateway pick, provider handoff) is shared. |
| `apps/api/src/modules/booking/application/use-cases/record-balance-payment.use-case.ts` | *Create.* Adds to `paid_amount` on an already-confirmed booking. |
| `apps/api/src/modules/booking/infrastructure/http/booking.module.ts` | *Modify.* The `payment.succeeded` handler routes to confirm **or** record-balance. |
| `apps/api/src/modules/finance/infrastructure/repositories/prisma-settlement.repository.ts` | *Modify.* `createHeldFromPayment`'s `update: {}` becomes an increment. |
| `packages/contracts/src/contracts/booking.ts` | *Modify.* Expose `balanceAmount` + `canPayBalance` on the customer booking response. |
| `apps/api/src/modules/booking/application/booking.mapper.ts` | *Modify.* Populate both. |
| `apps/storefront/app/features/account/components/bookings/booking-financial-summary.tsx` | *Modify.* The pay-balance button, where the balance is already rendered. |
| `apps/storefront/app/features/account/server/booking-history.server.ts` | *Modify.* Action branch that calls the checkout endpoint and redirects to the gateway. |

---

### Task 1: Let the payment entity decide a balance payment

**Files:**
- Modify: `apps/api/src/modules/payments/domain/entities/payment.entity.ts`
- Modify: `apps/api/src/modules/payments/domain/errors/payment-errors.ts`

**Interfaces:**
- Consumes: `PaymentBookingRecord` (`payment-booking-reader.port.ts`) — already carries `status`,
  `depositAmount`, `securityDeposit`, `finalAmount`, `paidAmount`.
- Produces: `Payment.assertBalancePayable(booking): void`,
  `Payment.planBalance(booking): { amount: bigint; kind: 'balance' }`, `NothingLeftToPay`.

- [ ] **Step 1: Add the error**

In `payment-errors.ts`, beside `BookingNotPayable`:

```ts
/** A balance payment was requested on a booking that owes nothing. */
export class NothingLeftToPay extends DomainError {
  constructor() {
    super('NOTHING_LEFT_TO_PAY', 409, 'This booking has no outstanding balance');
  }
}
```

Match the surrounding classes' base-class and import style exactly — read the file first; if
`BookingNotPayable` extends something other than `DomainError`, follow that.

- [ ] **Step 2: Add the two pure decisions to `Payment`**

Append inside the `Payment` class, after `plan`:

```ts
  /**
   * A balance payment is only legal on a booking that is already confirmed and
   * still owes money (§balance-payment). Deliberately separate from
   * {@link assertPayable} so the deposit path's `pending_payment` guard stays
   * strict — widening that one would let a cancelled booking take money.
   */
  static assertBalancePayable(booking: { status: string; finalAmount: bigint; paidAmount: bigint }): void {
    if (booking.status !== 'confirmed') {
      throw new BookingNotPayable(booking.status);
    }
    if (booking.finalAmount - booking.paidAmount <= 0n) {
      throw new NothingLeftToPay();
    }
  }

  /**
   * What is still owed. `additional_charges` are excluded on purpose: they accrue
   * at completion, after the service, and are settled on site — not through a
   * pre-service balance payment. The security deposit was taken with the deposit
   * payment, so it is not charged again.
   */
  static planBalance(booking: { finalAmount: bigint; paidAmount: bigint }): {
    amount: bigint;
    kind: 'balance';
  } {
    return { amount: booking.finalAmount - booking.paidAmount, kind: 'balance' };
  }
```

Add `NothingLeftToPay` to the existing error import at the top of the file.

- [ ] **Step 3: Verify**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/payments/domain
git commit -m "feat(api): let the payment entity decide a balance payment"
```

---

### Task 2: Branch the checkout use-case

**Files:**
- Modify: `apps/api/src/modules/payments/application/use-cases/checkout.use-case.ts:88-90`

**Interfaces:**
- Consumes: `Payment.assertBalancePayable`, `Payment.planBalance` (Task 1).
- Produces: `POST /public/bookings/:id/checkout` now succeeds on a confirmed booking with a balance,
  creating a payment for exactly the outstanding amount.

- [ ] **Step 1: Replace the single guard with a branch**

The use-case currently does:

```ts
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new BookingNotFound();
      Payment.assertPayable(booking);
```

Replace those three lines with:

```ts
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new BookingNotFound();
      // Two legal shapes: the first payment on a booking awaiting payment, and a
      // balance payment on one already confirmed but not fully paid (§balance-payment).
      const isBalance = booking.status === 'confirmed';
      if (isBalance) Payment.assertBalancePayable(booking);
      else Payment.assertPayable(booking);
```

Then find where the use-case calls `Payment.plan(booking)` and make it:

```ts
      const { amount, kind } = isBalance ? Payment.planBalance(booking) : Payment.plan(booking);
```

Everything downstream — gateway selection, `storefrontOrigin`, the provider handoff — is identical for
both shapes and must not be duplicated.

- [ ] **Step 2: Handle a re-click while a balance payment is already pending**

A customer who clicks twice must not create two gateway payments. Immediately after the branch above,
return the existing handoff when one is already open:

```ts
      const pending = await this.payments.findPendingForBooking(tx, bookingId);
      if (pending) return this.handoffFor(pending);
```

If `IPaymentRepository` has no `findPendingForBooking`, add it to the port and implement it in
`prisma-payment.repository.ts` as a `findFirst` on `{ bookingId, status: 'pending' }` ordered by
`createdAt desc`. If the use-case has no reusable handoff builder, extract the existing
provider-handoff construction into a private method rather than duplicating it.

- [ ] **Step 3: Verify against the running API**

```bash
pnpm --filter=@booking/api dev
```

Book and pay a deposit as in `docs/superpowers/plans/2026-08-11-money-flow-results.md` (mock gateway),
then:

```bash
curl -s -b "$CUSTOMER_JAR" -X POST "http://localhost:3000/public/bookings/$BID/checkout" \
  -H 'Host: bookingstudio.localhost' -H 'Content-Type: application/json' \
  -H "x-booking-code: $CODE" -d '{"paymentMethod":"bank_transfer"}'
```

Expected: **201** with a handoff, and a new `pending` payment of exactly `final_amount − paid_amount`
(140,000 on the 280,000 baseline). Before this task the same call returned
`BOOKING_NOT_PAYABLE`. Call it twice and confirm only **one** pending payment exists.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/payments
git commit -m "feat(api): accept a balance payment on a confirmed booking"
```

---

### Task 3: Add the balance to `paid_amount` instead of re-confirming

**Files:**
- Create: `apps/api/src/modules/booking/application/use-cases/record-balance-payment.use-case.ts`
- Modify: `apps/api/src/modules/booking/infrastructure/http/booking.module.ts:107-113`

**Interfaces:**
- Consumes: the `payment.succeeded` outbox event, whose payload already carries `bookingId`.
- Produces: `RecordBalancePaymentUseCase.execute(tenantId: string, bookingId: string, amount: bigint): Promise<void>`.

**The bug this avoids:** `ConfirmBookingUseCase` **sets** `paid_amount = depositAmount`
(`booking.entity.ts:161`). Routing a balance payment through it would reset the total back to the
deposit and silently lose the money.

- [ ] **Step 1: Create the use-case**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  BOOKING_REPOSITORY,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';

/**
 * A balance payment landed on an already-confirmed booking (§balance-payment):
 * add it to `paid_amount` and change nothing else.
 *
 * Deliberately NOT `ConfirmBookingUseCase`, which SETS `paid_amount` to the
 * deposit — routing a second payment through it would reset the total and lose
 * the balance. The status stays `confirmed`; a balance payment is not a state
 * transition, it is money arriving.
 */
@Injectable()
export class RecordBalancePaymentUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string, amount: bigint): Promise<void> {
    if (amount <= 0n) return;
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.bookings.addPaidAmount(tx, bookingId, amount);
    });
  }
}
```

- [ ] **Step 2: Add `addPaidAmount` to the repository port and implementation**

In `booking-repository.port.ts`:

```ts
  /** Add to `paid_amount` atomically — a balance payment never overwrites it. */
  addPaidAmount(tx: PrismaTx, bookingId: string, amount: bigint): Promise<void>;
```

In `prisma-booking.repository.ts`, implement it as a single guarded statement so two concurrent webhook
deliveries cannot lose an increment:

```ts
  async addPaidAmount(tx: PrismaTx, bookingId: string, amount: bigint): Promise<void> {
    await tx.$executeRaw`
      UPDATE bookings SET paid_amount = paid_amount + ${amount}, updated_at = now()
      WHERE id = ${bookingId}::uuid`;
  }
```

- [ ] **Step 3: Route the event**

In `booking.module.ts`, replace the `payment.succeeded` handler body:

```ts
    this.registry.register('payment.succeeded', async (event) => {
      const payload = event.payload as {
        bookingId: string;
        amount?: string;
        skipBookingConfirmation?: boolean;
      };
      if (payload.skipBookingConfirmation === true) return;
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return;
      // A payment landing on an already-confirmed booking is a BALANCE payment:
      // add the money, do not re-run confirmation (which would reset paid_amount
      // to the deposit and lose it).
      const booking = await this.readBooking.execute(tenantId, payload.bookingId);
      if (booking?.status === 'confirmed' && payload.amount) {
        await this.recordBalance.execute(tenantId, payload.bookingId, BigInt(payload.amount));
        return;
      }
      await this.confirmBooking.execute(tenantId, payload.bookingId);
    });
```

Inject `RecordBalancePaymentUseCase` and whichever existing use-case reads a booking by id into the
module class, and register `RecordBalancePaymentUseCase` in `providers`. If no read use-case is already
injected there, prefer the booking repository port over adding a new one.

- [ ] **Step 4: Ensure the event carries `amount`**

The handler needs the payment amount. Find where `payment.succeeded` is emitted (in the payments
module's webhook handling) and confirm the payload includes the amount as a digit string; add it if
absent. Money crosses the outbox as a **string**, never a JS number.

- [ ] **Step 5: Verify end to end**

Pay a deposit, then pay the balance through the endpoint from Task 2 and settle it with a signed mock
webhook. Then:

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT code, status, final_amount, paid_amount FROM bookings WHERE code='<CODE>';"
```

Expected: status still **`confirmed`**, `paid_amount` **280,000** = `final_amount`. Before this task it
would have stayed 140,000 or been reset to it.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/booking
git commit -m "feat(api): add a balance payment to paid_amount without re-confirming"
```

---

### Task 4: Make the settlement hold the balance too

**Files:**
- Modify: `apps/api/src/modules/finance/infrastructure/repositories/prisma-settlement.repository.ts:136-148`

**Interfaces:**
- Consumes: the second `payment.succeeded` for a booking.
- Produces: `online_held_amount` reflecting **all** money held online for the booking.

**The bug being fixed:** `createHeldFromPayment` upserts with `update: {}` — a literal no-op. The
money-flow run measured exactly this: after paying a 140,000 balance, `online_held_amount` stayed
140,000 and the remaining 140,000 was booked as an on-site collection that never happened.

- [ ] **Step 1: Derive the held amounts from ALL succeeded payments, and SET them**

Do **not** write `{ increment: … }`. Outbox delivery is at-least-once — `markSucceeded` is a guarded
UPDATE so the event is *emitted* once per payment, but the same event row can be *delivered* to
handlers more than once, and an increment would then inflate custody and every split derived from it.

Recomputing from the source of truth is idempotent by construction: replaying the event lands on the
same number. Replace the whole body after the `payment.status !== 'succeeded'` guard:

```ts
    // Total money ever taken online for this booking — not just this payment.
    // A balance payment (§balance-payment) is a SECOND succeeded payment on an
    // already-confirmed booking, and custody must reflect both.
    const paidTotal = await tx.payment.aggregate({
      where: { bookingId: payment.bookingId, status: 'succeeded' },
      _sum: { amount: true },
    });
    const totalPaid = paidTotal._sum.amount ?? 0n;
    // The security deposit is taken once, with the first payment; the rest is
    // service money. Identical to the old single-payment maths when there is one.
    const securityDepositHeld =
      payment.booking.securityDeposit < totalPaid ? payment.booking.securityDeposit : totalPaid;
    const onlineHeldAmount = totalPaid - securityDepositHeld;

    return toRecord(
      await tx.bookingSettlement.upsert({
        where: { bookingId: payment.bookingId },
        create: {
          tenantId,
          bookingId: payment.bookingId,
          paymentId,
          partnerId: payment.booking.partnerId,
          onlineHeldAmount,
          securityDepositHeld,
        },
        // SET, never increment — see above. `payment_id` deliberately stays the
        // deposit's: the column is unique and one settlement serves one booking, so
        // an automatic gateway refund can only target that first transaction and a
        // larger refund uses the manual flow (§balance-payment decision 2).
        update: { onlineHeldAmount, securityDepositHeld },
      }),
    );
```

Delete the two old `securityDepositHeld` / `onlineHeldAmount` lines that derived from `payment.amount`
alone — they are replaced by the block above.

- [ ] **Step 2: Confirm replay safety by hand**

Deliver the same mock webhook twice for one payment, then check custody did not move:

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT online_held_amount, security_deposit_held FROM booking_settlements s
     JOIN bookings b ON b.id=s.booking_id WHERE b.code='<CODE>';"
```

Expected: identical before and after the second delivery. With an increment it would have doubled —
this is the check that proves the SET-from-source design is doing its job.

- [ ] **Step 3: Verify the money**

Pay deposit + balance on a 280,000 booking, complete it as the partner reporting **0** collected on
site, and let it release. Then:

```bash
docker compose exec -T postgres psql -U postgres -d booking -x -c \
  "SELECT s.online_held_amount, s.onsite_collected_amount, s.partner_gross_earning, s.partner_payable,
          s.platform_fee, s.tenant_net_earning
     FROM booking_settlements s JOIN bookings b ON b.id=s.booking_id WHERE b.code='<CODE>';"
```

Expected: `online_held_amount` **280,000**, `onsite_collected_amount` **0**, and the split unchanged
from the baseline — partner **241,111**, platform **5,185**, tenantNet **33,704**, `partner_payable`
**241,111** (the tenant owes the partner everything, because the partner collected nothing).

That last figure is the whole point: before this change the partner was owed only 101,111 because the
system believed they had pocketed 140,000 in cash.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/finance
git commit -m "fix(api): a balance payment increases the settlement's held amount"
```

---

### Task 5: Expose the balance on the customer booking response

**Files:**
- Modify: `packages/contracts/src/contracts/booking.ts` (`bookingCoreSchema`, near `vatBps`)
- Modify: `apps/api/src/modules/booking/application/booking.mapper.ts` (`toCore`)

**Interfaces:**
- Produces: `balanceAmount: string` and `canPayBalance: boolean` on every booking response.

The storefront already computes a balance client-side in
`booking-financial-summary.tsx:20`. Deriving "can I pay this?" in the browser would duplicate a
server rule; ship the decision instead.

- [ ] **Step 1: Add both fields to `bookingCoreSchema`**

```ts
  /** VND đồng digit string; `final_amount − paid_amount`, never negative. */
  balanceAmount: z.string(),
  /**
   * Whether the customer may settle that balance online right now — true only for
   * a confirmed booking that still owes money. The server owns this rule so the
   * storefront never has to re-derive it.
   */
  canPayBalance: z.boolean(),
```

- [ ] **Step 2: Populate them in `toCore`**

Beside the existing `vatBps` / `vatAmount` lines:

```ts
    balanceAmount: max0(b.finalAmount - b.paidAmount).toString(),
    canPayBalance: b.status === 'confirmed' && b.finalAmount - b.paidAmount > 0n,
```

Add the helper at the bottom of the file if it is not already there:

```ts
function max0(value: bigint): bigint {
  return value > 0n ? value : 0n;
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter=@booking/contracts build
pnpm turbo typecheck
```

Expected: clean. If the storefront's own `BookingDetailViewModel` derives a balance locally, leave it —
switching it over is Task 6's job.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts apps/api/src/modules/booking/application/booking.mapper.ts
git commit -m "feat(contracts): expose balanceAmount and canPayBalance on a booking"
```

---

### Task 6: The pay-balance button

**Files:**
- Modify: `apps/storefront/app/features/account/components/bookings/booking-financial-summary.tsx`
- Modify: `apps/storefront/app/features/account/server/booking-history.server.ts`
- Modify: `packages/i18n/src/locales/vi/account.ts`, `packages/i18n/src/locales/en/account.ts`

**Interfaces:**
- Consumes: `canPayBalance`, `balanceAmount` (Task 5); `POST /public/bookings/:id/checkout` (Task 2).
- Produces: a customer-facing action that redirects to the gateway handoff.

- [ ] **Step 1: Add the copy**

`vi/account.ts`, in the `bookings.payment` block:

```ts
      payBalance: 'Thanh toán số dư',
      payBalanceFailed: 'Không tạo được thanh toán số dư. Vui lòng thử lại.',
```

`en/account.ts`, same block:

```ts
      payBalance: 'Pay the balance',
      payBalanceFailed: 'Could not start the balance payment. Please try again.',
```

Interpolation in this repo uses **single** braces (`create-i18n.ts:39`), but neither string
interpolates, so nothing to parameterise.

- [ ] **Step 2: Render the button where the balance already is**

`booking-financial-summary.tsx` already computes `hasBalance`. Add `canPayBalance` and `bookingId` to
its props and render, directly under the balance row:

```tsx
      {canPayBalance ? (
        <Form method="post" className="mt-2">
          <input type="hidden" name="intent" value="pay-balance" />
          <input type="hidden" name="bookingId" value={bookingId} />
          <Button type="submit" size="sm" className="w-full">
            {t('bookings.payment.payBalance')}
          </Button>
        </Form>
      ) : null}
```

Thread the two new props from every caller (`booking-history-card.tsx:97` passes `balanceAmount`
today — pass the new fields from the same object). Import `Form` from `react-router` and `Button` from
`@booking/ui/components/ui/button`, matching the file's existing import style.

- [ ] **Step 3: Handle the action server-side**

In `booking-history.server.ts`, add a `pay-balance` intent that calls the backend and redirects to the
gateway. Follow the file's existing action shape exactly — same auth helper, same error envelope:

```ts
  if (intent === 'pay-balance') {
    const bookingId = String(form.get('bookingId') ?? '');
    const res = await apiPost<CheckoutResponse>(
      apiPaths.public.bookingCheckout(bookingId),
      { paymentMethod: 'bank_transfer' },
      auth,
    );
    if (!res.ok || !res.data) {
      return data({ error: t('bookings.payment.payBalanceFailed') }, { status: 400 });
    }
    return redirect(res.data.destination.paymentUrl);
  }
```

Add `bookingCheckout` to `~/constants/api-paths` if absent — **never** string-build a backend path.
Read `CheckoutResponse` in `@booking/contracts` first: if `destination` is a discriminated union
(`redirect` vs something else), branch on its `type` rather than assuming `paymentUrl` exists.
`paymentMethod` should come from the tenant's enabled methods rather than being hardcoded if that list
is already available on the page; hardcoding `bank_transfer` is acceptable only because it is the sole
method every seeded gateway supports.

- [ ] **Step 4: Verify in the running app**

```bash
pnpm --filter=@booking/i18n build && pnpm --filter=@booking/contracts build
pnpm dev
```

Book a `studio-a-han-quoc` slot, pay the 140,000 deposit, then open
`http://bookingstudio.localhost:5173/vi/account/bookings/<CODE>`.

Expected: **"Còn lại phải thanh toán 140.000 ₫"** now sits above a **"Thanh toán số dư"** button.
Click it, settle the resulting payment with a signed mock webhook, reload: the balance row is replaced
by the paid-in-full label and the button is gone.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront packages/i18n
git commit -m "feat(storefront): let a customer pay an outstanding booking balance"
```

---

### Task 7: Full verification and documentation

**Files:**
- Modify: `TONG-QUAN.md` (§8.3 balance handling)
- Modify: `docs/superpowers/plans/2026-08-11-money-flow-results.md` (mark D1 fixed)

- [ ] **Step 1: Run the full static check**

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm check:theme-tokens && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Expected: every gate green. Note `check:theme-tokens` is **not** in the AGENTS.md "full static check"
line but is a real gate — it was missed once already.

- [ ] **Step 2: Re-run the three money shapes and confirm they now differ correctly**

Using the driver described in `2026-08-11-money-flow-results.md`:

| Shape | `online_held` | `onsite_collected` | `partner_payable` |
| --- | --- | --- | --- |
| pay 100 % upfront | 280,000 | 0 | 241,111 |
| 50 % + **balance paid online** | **280,000** | **0** | **241,111** |
| 50 % + `on_arrival` | 140,000 | 140,000 | 101,111 |

The split (partner 241,111 / platform 5,185 / tenantNet 33,704) must be identical in all three — how
the customer pays still must not change what anyone earns. The middle row is what this plan creates;
before it, it was indistinguishable from the third.

- [ ] **Step 3: Update the docs**

In `TONG-QUAN.md` §8.3, state that an `online_before` balance is paid by the customer from the account
booking page and that an unpaid balance still falls back to on-site collection at completion. In the
money-flow results doc, mark **D1 as fixed** and point at this plan.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: record the online-before balance payment flow"
```

---

## Explicitly out of scope

- **Payment reminders.** A notification before the service date telling the customer to pay is a
  separate feature; nothing here schedules one.
- **A hard payment deadline / auto-cancel.** Decision 1 keeps the on-site fallback instead.
- **Refunds spanning both payments.** Decision 2: automatic refunds still target the deposit
  transaction; anything larger uses the existing `manual_required` flow.
- **Paying `additional_charges` online.** They accrue after the service and settle on site.
- **Partner-side visibility** of whether the balance was paid online — the partner's completion screen
  already shows the outstanding figure, which will simply read 0.
