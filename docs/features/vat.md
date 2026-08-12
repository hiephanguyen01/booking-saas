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
| `household_declaring` | **tỷ lệ % trên doanh thu** | **4% → 5% from 2027-01-01** for services | straight on revenue: `g × r` |
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

The VAT-reduction window also cuts the percentage-method service rate by 20%, so
the schedule contains 4% through 2026-12-31 and 5% from 2027-01-01.

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
| Partner | the gross booking — or nothing, if under the effective annual threshold (1B ₫ from 2026) |
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

## Withholding at source — the applicable instruments

When the platform/tenant collects payment for a household or individual partner,
the product applies provisional withholding. Three instruments govern it, and only
two of them are encoded anywhere:

| What | Instrument | Where it lives in this repo |
| --- | --- | --- |
| The withholding obligation + rate | **NĐ 117/2025/NĐ-CP** | `withholding_rates`, one row: 5% VAT + 2% PIT for services from 2025-07-01 |
| How the withheld tax is declared and paid on behalf | **NĐ 68/2026/NĐ-CP** | **nowhere in code** — a doc link only (see below) |
| The household annual-revenue threshold | **NĐ 141/2026/NĐ-CP** | `tax_threshold_rules`: 1B ₫ from 2026-01-01, revision 2, published 2026-05-25 |

**NĐ 141/2026 is the currently-applicable threshold**, not Luật 48/2024's 200M —
it retroactively replaced the short-lived 500M wording for 2026, so the active
schedule jumps 200M (2025) → 1B (2026 onward). `tax-threshold-rules.ts` carries
both rows with their `publishedAt`, so a retroactive revision is auditable rather
than an overwrite.

The **rate** schedule has no 2026 row: 5% + 2% still carries `legalRef:
'NĐ 117/2025/NĐ-CP'` and has never been superseded here. If NĐ 68/2026 or any
later instrument changed the service rates or their effective dates, the schedule
is stale — and it is effective-dated data, so the fix is one row, not a deploy.

Companies and house inventory are not withheld from: a company declares for
itself, while house inventory has no third-party seller.

### The trigger is transaction acceptance, not payout

The operational trigger is **`booking.completed`** — confirmed service completion,
which this product treats as the platform accepting the transaction. It is
assessed in `StartSettlementWindowUseCase` (and `StartNoShowSettlementWindowUseCase`
for a no-show), in the same transaction that opens the dispute window.

**Four lifecycles, never collapsed into one:**

```
payment.succeeded  →  customer funds held        (no revenue, no tax)
booking.completed  →  TRANSACTION ACCEPTED
                        ├─ tax assessment            ← tax happens HERE
                        └─ settlement = dispute window
dispute deadline   →  settlement released, revenue journal
                   →  payout
refund (any time)  →  linked tax reversal + settlement/ledger adjustment
```

`money received ≠ revenue ≠ tax assessment ≠ settlement ≠ payout`. A settlement
release creates **no tax fact**; the dispute window only keeps the partner payout
unavailable. A confirmed refund creates a linked, proportional reversal instead of
mutating the original event.

> **Until 2026-08-12 the code did not do this.** `RecordSettlementWithholdingUseCase`
> was called from `ReleaseSettlementUseCase`, so the real trigger was *settlement
> release* — after the dispute window — and `occurred_at` was `released_at`, which
> put a transaction completed on the 31st into the **following month's** filing
> period. A refund landing before release produced no assessment/reversal pair at
> all, only a single assessment already netted down. This section described the
> intended design, not the shipped one. Both are now aligned on the design above.

The filing period is the month the transaction was accepted (`completed_at`), never
the month a payout cleared. A reversal enters the month it occurs, which is what
lets `assessment − Σ reversals` reconcile across period boundaries.

#### ⚠️ Tax Counsel confirmation required

Two questions are legal, not engineering, and must be signed off before production.
They are independent — a "yes" to the first does not settle the second.

**Resolve both against NĐ 68/2026/NĐ-CP, not against NĐ 117/2025 alone.** NĐ 117
creates the obligation and the rate; NĐ 68/2026 is the guidance on *declaring and
paying withheld tax for business on an e-commerce platform*, which is precisely the
mechanics these two questions turn on. That decree is cited at the bottom of this
page as a link and is reflected **nowhere in the code** — nobody has reconciled its
text against what is implemented here.

1. Is `booking.completed` the moment the platform *“xác nhận giao dịch thành công
   và chấp nhận thanh toán”*? The wording in NĐ 117/2025 Đ.5 reads earlier than
   service completion — for a deposit-plus-onsite booking it could be
   `payment.succeeded`. The current mapping is a product judgement, not a legal one,
   and NĐ 68/2026's declaration timing is what should settle it.
2. At that moment, is `taxableAmount` the **whole transaction value**, only the
   **portion the platform collected**, or something else given the transaction
   structure? The code assesses the whole partner service revenue including cash
   collected on site (see below) — that choice needs confirming, not assuming.
   Note the platform can only ever *reverse* tax on money it holds (below), so the
   two halves of this question interact.

Also unreconciled: the statutory mechanism for offsetting tax already withheld on a
cancelled transaction (offset against a later period vs. an amended return), and
whether the 5% + 2% service rates and their 2025-07-01 effective date are still
current under the 2026 instruments — `withholding_rates` has never been revised.

This is a deduction from the partner's existing gross share, not a customer charge
and not new tenant revenue. For a 280,000 ₫ declaring-household booking:

```text
partner gross share       240,100
VAT withheld (5% gross)   -14,000
PIT withheld (2% gross)    -5,600
partner payable           220,500
```

`partnerShare + platformFee + affiliate + tenantNet` remains equal to customer
cash. The ledger first credits the full partner share, then debits the two withheld
amounts and credits a dedicated **tax-authority liability**, never tenant revenue.
`booking_settlements` stores the
two deductions separately, and the immutable booking snapshot freezes the rate
beside VAT so historical releases replay exactly.

The assessment base is the partner's total actual service revenue, including an
amount collected on site; it is not limited to cash that passed through the
gateway. All individual/household branches are provisionally withheld at 5% + 2%.
Any excess caused by the seller's final annual status is carried forward or
refunded during reconciliation.

Two cases look surprising but are intentional:

- A declaring household's sale currently uses 4% VAT while the platform withholds
  5% VAT. The difference is handled in annual reconciliation; the code must not
  silently net the two rates.
- A household below the current 1B ₫ annual threshold has a 0% sale rate but is
  still provisionally withheld from on a platform-collected transaction. The
  amount is credited or reclaimed through the applicable annual process.

Tenant finance now includes monthly draft preparation, filing-reference capture,
remittance evidence, liability settlement and annual withholding-certificate
metadata. The operator still submits/pays through the official tax channel and
uploads the resulting artifact reference; BookingOS records and reconciles that
work rather than impersonating the tax portal. Annual credit/refund execution is
still manual. Legal reference: [NĐ 117/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=213883&orggroupid=2&pageid=27160)

## Automatic annual-threshold classification

The threshold is not a frontend constant. `tax_threshold_rules` is global,
effective-dated legal reference data; the active 2026 row is 1B ₫ under
NĐ 141/2026/NĐ-CP. `partner_tax_year_assessments` combines two sources:

- BookingOS settlement revenue, recorded as append-only idempotent
  `partner_tax_revenue_events`; and
- the latest partner declaration of revenue earned outside BookingOS, with every
  declaration retained in `partner_tax_declarations` for audit.

A household without an external-revenue declaration is classified conservatively
as `household_declaring`. Once declared, total revenue at or below the rule becomes
`household_below_threshold`; strictly above it becomes `household_declaring`.
Revenue-driven crossings are sticky for the year so refunds cannot oscillate the
status. A legal-rule revision can reassess both directions. The daily worker also
backfills released settlements and applies retroactive rule changes. Manual
overrides require a reason, are audited, and expire at the next Vietnam tax year.

The booking's `commission_snapshot.tax` remains immutable. Automatic status
changes affect later bookings; retrospective quarter/year differences belong to
the reconciliation workflow rather than mutation of an existing booking or
ledger journal.
and [NĐ 68/2026/NĐ-CP guidance](https://xaydungchinhsach.chinhphu.vn/huong-dan-khai-thue-khau-tru-thue-voi-hoat-dong-kinh-doanh-tren-nen-tang-thuong-mai-dien-tu-119260309150311529.htm).

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

## Who sets what, and where

Both classifications are tenant-editable in the dashboard — a wrong one silently
mis-taxes every booking, so neither should ever need SQL:

| Field | Screen | Notes |
| --- | --- | --- |
| `listing_types.tax_category` | listing-type create/edit form | Offers only the four **deduction-method** categories. `percentage_service` is deliberately absent: it is chosen by the seller, and letting a tenant set it here would set a rate the resolver ignores. |
| `partners.tax_status` | partner detail → **Hồ sơ thuế** | Each option shows its consequence (`4% (5% từ 2027)` vs `8% (10% từ 2027)` vs `0`), because the names alone do not reveal that two of the four mean no VAT. |

Changing either only affects **future** bookings; existing ones replay the rate
frozen on their snapshot.

## Not implemented
- **E-invoicing** (hóa đơn điện tử) and VAT reporting exports.
- Direct tax-portal submission/payment integration and automatic annual
  credit/refund execution. BookingOS records filings, remittances and certificate
  metadata, but a human operator performs the external legal act.

## Open question for the accountant

Whether the platform's **subscription fee** is "dịch vụ phần mềm" and therefore
VAT-exempt under Luật 48/2024/QH15 Đ.5. It affects only the platform→tenant invoice,
which none of the above touches — but being exempt also forfeits input-VAT deduction
on infrastructure spend, so settle it before the first real invoice.
