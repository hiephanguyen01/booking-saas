# VAT (thuế GTGT)

How Vietnamese VAT is resolved, frozen and applied. Implemented 2026-08-11.

## The one decision everything follows from

**The platform owns the RATE; the tenant owns the CLASSIFICATION.**

| | Owner | Where |
| --- | --- | --- |
| The rate a category maps to at a date | Platform | `tax_rates` (global table) |
| What category a service falls in | Tenant | `listing_types.tax_category` |
| Whether the seller charges VAT at all | Tenant | `partners.tax_status`, `tenants.tax_status` |

A tenant can never type a percentage. That is both a fraud-surface argument and a
maintenance one: the rate is national law, identical for every tenant, so a change
must be one row edit rather than a fan-out across every tenant's rows.

`tax_rates` therefore has **no `tenant_id` and no RLS** — it sits with
`administrative_provinces` and `subscription_plans` as global reference data, and
`check:rls` correctly ignores it.

## Two regimes, chosen by WHO sells

Vietnam has two mutually exclusive VAT methods, and the seller's status — not the
listing type — decides which applies:

| Seller | Method | Rate | Arithmetic |
| --- | --- | --- | --- |
| `company_vat` | **khấu trừ** (deduction) | 8% → 10% from 2027-01-01 | contained in the gross: `g × r / (100+r)` |
| `household_declaring` | **tỷ lệ % trên doanh thu** | **5%** for services | straight on revenue: `g × r` |
| `household_below_threshold`, `individual` | none | 0 | — |

They differ in the arithmetic as well as the rate: on 280,000 ₫ the deduction
method yields **20,741** and the percentage method **14,000**. `taxMethodFor()`
picks the regime, `vatOf()` applies the right formula, and the method is frozen on
the snapshot beside the rate.

A declaring household therefore never reads `listing_types.tax_category` — it has
one service rate whatever it sells, so its category is always
`percentage_service`. Only a deduction-method seller consults the catalogue.

> Until 2026-08-11 `household_declaring` shared the `company_vat` branch and was
> billed 8% by the deduction formula — wrong on both counts. No seeded partner used
> that status, so no data was affected.

**Open for the accountant:** past VAT-reduction resolutions also cut the percentage
rate by 20%, which would make it 4% until 2026-12-31. If confirmed, that is one
extra row in `tax_rates`, not a code change.

## Prices are VAT-inclusive gross

`listing.price`, `bookings.total_amount` and `final_amount` are **gross, VAT
included**. Vietnamese price-display law requires a consumer to see one final
number, and adding VAT at checkout would also be a conversion disaster.

The consequence is arithmetic, and it is the easiest thing to get wrong:

```ts
vatFromGross(gross, bps)   // gross × bps / (10000 + bps)   ← correct
percentOfBps(gross, bps)   // gross × bps / 10000           ← WRONG here
```

On a 2,000,000 ₫ booking at 8% the right answer is **148,148 ₫**, not 160,000 ₫.
Always take the net with `netOfVat` rather than rounding a second time, so
`net + vat` re-sums to the exact gross and no ledger leg drifts by a đồng.

## Commission applies to the net (option B)

Every rate — tenant, platform, affiliate — bites on the VAT-exclusive amount, so a
published 15% take-rate really is 15% of the seller's revenue and not 15% of
revenue + state VAT.

The partner keeps the **gross residual**. Under the agent model (see below) the VAT
inside the partner's share is the partner's own to remit, so:

```
cash 2,000,000 = partner 1,722,222 + affiliate 92,593 + platform 37,037 + tenant 148,148
```

still balances exactly. **This is why the ledger needed no new entry type** — a
significant risk reduction, since `ledger_entries` are immutable and a wrong split
can only be corrected by a reversing entry.

`platform% + affiliate% <= tenant%` is unaffected: all three now share one base.

## Agent, not principal

The tenant is a **commission agent**, not the seller of record. This was not a new
decision — `TONG-QUAN.md` §13.2 already booked tenant revenue as *net commission*
(148,148 ₫), not gross booking value. Naming it settles who owes what:

| Party | Declares VAT on |
| --- | --- |
| Partner | the gross booking — or nothing, if under the 200M ₫/year threshold |
| Tenant | its commission |
| Platform | its 2% fee + subscription |

## The rate is fixed by the SERVICE date

`ResolveTaxUseCase` resolves for `booking.start`, **never** `now`. VAT on a service
is fixed when the service is delivered, so a booking made 2026-12-20 for a session
on 2027-01-15 is a **10%** booking. Quoting it at 8% would mean the tenant eats the
2% difference.

The same use-case serves both the checkout quote and booking creation, so the rate a
customer is shown can never disagree with the rate frozen onto their booking.

## Frozen, then replayed

The resolved rate is frozen into `bookings.commission_snapshot.tax`:

```json
{ "taxRateId": "…", "category": "standard", "vatBps": 800,
  "legalRef": "NQ 204/2025/QH15", "resolvedFor": "2026-08-20T07:00:00.000Z" }
```

It rides on the existing snapshot rather than a second column because every replay
path already threads exactly one snapshot object; two could go null-vs-present out
of sync. `tax` is **optional**, and `snapshotToRates` reads a missing one as
`vatBps: 0`, so a booking created before this feature behaves exactly as it did.

An invoice issued in 2027 for a 2026 booking therefore still prints 8%.

## The 2027 changeover needs no deploy

The seed writes the 10% row **already**, opening the instant the NQ 204/2025
reduction lapses:

| category | rateBps | effective_from | effective_to |
| --- | --- | --- | --- |
| standard | 800 | 2025-07-01 +07 | 2027-01-01 +07 |
| standard | 1000 | 2027-01-01 +07 | — |

The windows meet exactly, with no gap and no overlap (a `(category, effective_from)`
unique constraint prevents a second row covering the same instant). `selectTaxRate`
simply starts matching the next row. Verified live: a March-2027 service date already
quotes 10% today.

Bounds are **+07:00**, because a tax period is a Vietnamese calendar date, not a UTC
one — 2027-01-01T00:00+07 is 2026-12-31T17:00Z.

## Customer-facing copy

Never state a rate as a literal string. Checkout reads `quote.vatBps`; the booking
detail reads the frozen rate off the booking. A seller charging no VAT gets
"Giá cuối cùng, không chịu thuế GTGT" rather than "includes 0% VAT".

The customer booking response exposes `vatBps` + `vatAmount` but **not**
`commission_snapshot` itself — the tax facts belong on the customer's receipt, the
tenant's take-rate does not.

> Until 2026-08-11 this copy read *"Giá đã bao gồm: Thuế 8%, Phí dịch vụ 5%"*. There
> is no 5% customer-facing service fee in this system — the platform fee is 2% and
> comes out of the tenant's share. Do not reintroduce a fee the customer does not pay.

## Not implemented

- **Tenant UI** for `tax_category` / `tax_status` — set via seed or SQL today. This
  is the largest remaining gap for a real tenant.
- **NĐ 117/2025 withholding** — where the tenant has the payment function and the
  partner is a household/individual, the tenant must withhold 5% VAT + 2% PIT and
  remit. This is what a `vat_withheld` ledger entry type would be for; it changes the
  payout amount, so it needs an accountant's sign-off.
- **E-invoicing** (hóa đơn điện tử) and VAT reporting exports.

## Open question for the accountant

Whether the platform's **subscription fee** is "dịch vụ phần mềm" and therefore
VAT-exempt under Luật 48/2024/QH15 Đ.5. It affects only the platform→tenant invoice,
which none of the above touches — but being exempt also forfeits input-VAT deduction
on infrastructure spend, so settle it before the first real invoice.
