# Money-Flow Verification Results — 2026-08-11

Run against branch `feat/dynamic-vat` on the local dev stack. Plan:
[`2026-08-11-money-flow-browser-verification.md`](./2026-08-11-money-flow-browser-verification.md).

**Headline:** 13 scenarios, every one matching its predicted split to the đồng. Across the whole
database: **0 unbalanced journals, 0 negative legs.** Two defects found — one seed fixture (fixed) and
one real product gap (open).

`S7` reached the VAT-exempt branch by temporarily flipping `giang-studio.tax_status` in SQL and
restoring it afterwards, because no endpoint exposes a partner's tax status yet — that tenant UI is the
known gap from the VAT work.

## Method, and its one caveat

Each scenario books through the real API, settles a real payment via the signed mock-gateway webhook,
is completed by the real partner endpoint, and is released by the real scheduler. Numbers are then
compared three ways: the `booking_settlements` row, the `ledger_entries` journal, and — for the
baseline and the rate-change cases — arithmetic worked **by hand from the published rates** before
running. The hand check matters because the expectation table was generated from the same
`computeCommissionSplit` under test; only hand arithmetic can catch a systematic error in it.

**Caveat, stated plainly:** a booking cannot be completed before its slot ends (`SERVICE_NOT_ENDED`) and
cannot be created less than 2 h out, so every scenario had its `timeslot`/`blocked_period` shifted into
the past by SQL after payment. That touches **scheduling columns only** — no money column, no rate, no
snapshot. Completion still went through the real endpoint and the real domain guard. Verified after the
fact: all 8 completed scenarios show `partner confirmed service completion` with a real actor, i.e. the
partner endpoint won every race against the auto-completion sweep. The one booking that *was*
auto-completed (`BK-63A8JA`) is excluded from the results below.

## Results

Baseline listing `studio-a-han-quoc`, 280,000 ₫/h, partner `giang-studio` (`company_vat` → 8 % VAT),
tenant 15 % / platform 2 % / affiliate 5 % unless stated.

| # | Scenario | partner | platform | affiliate | tenantNet | legs = cash |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | 50 % deposit baseline | 241,111 | 5,185 | 0 | 33,704 | 280,000 ✓ |
| S2 | `WELCOME10` tenant-funded, 560k | 482,222 | 9,333 | 0 | 12,445 | 504,000 ✓ |
| S3 | `PARTNER15` partner-funded | 204,944 | 4,407 | 0 | 28,649 | 238,000 ✓ |
| S4 | affiliate `R-DEMO01` | 241,111 | 5,185 | **12,963** | 20,741 | 280,000 ✓ |
| MF6a | **pay 100 % upfront** | 241,111 | 5,185 | 0 | 33,704 | 280,000 ✓ |
| MF6b | 50 % + **on-arrival balance** | 241,111 | 5,185 | 0 | 33,704 | 280,000 ✓ |
| S6 | **platform rate 5 %** | 241,111 | **12,963** | 0 | **25,926** | 280,000 ✓ |
| MF8 | **tenant 20 % + platform 5 %** | **228,148** | 12,963 | 0 | **38,889** | 280,000 ✓ |
| MF9-1 | free cancellation (>168 h) | 0 | 0 | 0 | 0 | refund 140,000 ✓ |
| MF9-2 | penalty cancellation (<48 h) | 0 | 0 | 0 | **140,000** | 140,000 ✓ |
| MF9-3 | customer no-show | 120,555 | 2,593 | 0 | 16,852 | **140,000** ✓ |
| MF9-4 | dispute → partial refund | 241,111 | 5,185 | 0 | 33,704 | refunded 50,000 / retained 90,000 ✓ |
| S7 | **VAT-exempt seller (0 %)** | **238,000** | **5,600** | 0 | **36,400** | 280,000 ✓ |
| MF10 | payout | — | — | — | — | balance → **0** ✓ |

### What each result proves

- **Payment schedule is irrelevant to earnings.** S1, MF6a and MF6b differ only in when the customer
  pays; all three produce byte-identical splits. Only `online_held_amount` and `partner_payable` move
  (241,111 payable when paid in full, 101,111 when the partner already holds 140,000).
- **Promotion funding lands on the funder.** Tenant-funded: the partner still earns on the *original*
  price (482,222 on a 560,000 booking) while the tenant's take collapses to 12,445. Partner-funded: the
  *partner* drops to 204,944 while the tenant barely moves. The two are mirror images, as intended.
- **Affiliate comes out of the tenant, never the partner.** 33,704 − 12,963 = 20,741 exactly; the
  partner is untouched at 241,111.
- **A rate change moves exactly what it should, and nothing historical.** Platform 2 → 5 shifts
  **+7,778 to the platform and −7,778 from the tenant**, partner unchanged. Every previously released
  settlement still reads 5,185 — the frozen `commission_snapshot` holds.
- **Rate guard is all-or-nothing.** Platform 50 % rejected with `COMMISSION_RATES_NEGATIVE_TENANT`; no
  rule changed.
- **A free cancellation earns nobody anything** — no ledger entries at all. A penalty cancellation
  credits the retained amount **entirely to the tenant** (no partner or platform leg).
- **A no-show commissions only what was actually collected.** Base is `online_held_amount` (140,000),
  not the 280,000 booking value.
- **A dispute refund is capped by what is still held.** A 200,000 refund against 140,000 held is
  rejected with `INVALID_REFUND_AMOUNT`; a 50,000 partial refund moves the settlement to
  `refund_pending` with `retained_amount` 90,000.
- **VAT exemption moves money the way option B predicts.** With no VAT the partner receives **less**
  (238,000 vs 241,111) and the platform **more** (5,600 vs 5,185), because every rate then bites on the
  full gross rather than the VAT-exclusive base. A reversed direction would mean option B is wired
  backwards. The frozen snapshot reads `vatBps: 0`.
- **The payout closes the loop.** 8 released settlements → payable 1,098,869, agreed by the settlement
  table, the ledger-derived partner API balance, and hand addition. Paying it produced a balanced
  `payout` journal, 8 allocations summing to 1,098,869, and a partner balance of **0**.

### Hand-checked arithmetic (independent of the code)

```
S1   280,000 @ 8%  → VAT 20,741, net 259,259
     tenant 15% of net = 38,889 → partner 280,000 − 38,889 = 241,111 ✓
     platform 2% of net = 5,185 ✓   tenantNet 38,889 − 5,185 = 33,704 ✓

MF8  tenant 20% of net = 51,852 → partner 280,000 − 51,852 = 228,148 ✓
     platform 5% of net = 12,963 ✓   tenantNet 51,852 − 12,963 = 38,889 ✓
```

Both land exactly on the observed figures.

## Defects

### D1 — An `online_before` balance can never be paid (high) — **FIXED**

A 50 %-deposit booking with `balance_due = online_before` reaches `confirmed` after the deposit. From
there:

- the customer's booking page offers only **Hủy đơn** — no payment action;
- `POST /public/bookings/:id/checkout` returns **`BOOKING_NOT_PAYABLE`** — *"Booking is confirmed, not
  awaiting payment"*.

There is no path, UI or API, to collect the remaining balance online. **80 of StudioHub's 120
listings are configured this way.** Confirmed quantitatively: MF6b (`on_arrival`) produced results
**identical** to S1 (`online_before`) — the setting currently makes no difference, because either way
the balance can only be collected on site.

**Fixed** by [`2026-08-11-online-before-balance-payment.md`](./2026-08-11-online-before-balance-payment.md)
on branch `feat/balance-payment`. The customer now settles the balance from their booking page; the
three payment shapes finally differ as they should:

| Shape | `online_held` | `onsite_collected` | `partner_payable` |
| --- | --- | --- | --- |
| pay 100 % upfront | 280,000 | 0 | 241,111 |
| 50 % + **balance paid online** | **280,000** | **0** | **241,111** |
| 50 % + `on_arrival` | 140,000 | 140,000 | 101,111 |

The split stays 241,111 / 5,185 / 33,704 in all three — how the customer pays still does not change
what anyone earns. Redelivering the balance webhook was verified to move neither `paid_amount` nor
`online_held_amount`.

### D2 — The seeded overdue payout over-claims the partner's payable (medium) — **FIXED**

`payouts` carries a seeded `pending` row of **1,275,000 ₫** for `giang-studio`. The partner's mature
payable from seeded bookings is **0** — the entire 1,098,869 observed came from this run's settlements.
Because `available = maturePayable − outstanding`, that fixture makes the payout flow return
`NOTHING_TO_PAY` on a fresh database, i.e. **payouts cannot be exercised out of the box**. Marking it
paid would drive the partner's ledger balance to −176,131.

**Fixed** in `seed/demo/studio-demo.ts`: the fixture is now **150,000 ₫** with a comment explaining
that a pending payout claims against mature payable, so the amount must stay small enough not to
deadlock the flow. The board still shows an overdue run, and payouts free themselves as soon as one
real booking releases. Database reset and reseeded to pick it up.

## Not covered

Stated explicitly rather than implied:

- **S5 house partner / inventory mode.** All 40 `studiohub-house` listings are `inventory` with a
  3,500,000 ₫ security deposit, and settle through the pickup/return flow, not `complete`. Needs a
  different driver.
- **Damage deductions, `clawback` after release, reschedule fees.**
- **The provider side of a refund.** `MF9-4` leaves the settlement in `refund_pending`; the mock
  gateway's refund is `manual_required`, so the money leaving the tenant's account and the retained
  90,000 completing its second holding window were not driven.
- **BookingStad.** Nothing here books on the second tenant, so cross-tenant isolation of money is
  untested.
- **UI as a third surface.** The settlement row and the ledger were compared for every scenario; the
  dashboard screens were only spot-checked.

## Environment notes

Three problems cost real time and are worth knowing:

1. `pnpm install` mid-session corrupts the Vite pre-bundle cache — the storefront then throws *"Invalid
   hook call … more than one copy of React"* despite there being exactly one React. Fix:
   `rm -rf apps/*/node_modules/.vite` and restart.
2. Flushing Redis kills customer sessions; guest checkout with a registered email is then correctly
   refused with `EMAIL_REGISTERED`.
3. Opaque session cookies rotate — a read-only curl cookie jar goes stale between scenarios. Use
   `-b` **and** `-c`.

## State left behind

13 settlements, their bookings, payments and ledger entries. Harmless but they skew the admin GMV
board. `ledger_entries` are immutable by design, so nothing was hand-deleted; a reseed is the only
clean removal and needs the owner's explicit consent.

Restored: commission rates `15 / 2`, listing `studio-a-han-quoc` back to `50 / online_before`.
