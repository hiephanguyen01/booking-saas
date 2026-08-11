# Money-Flow Browser Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to work through this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive every money-moving path of a booking through the real UI and prove that what each party
(partner / tenant / platform / affiliate) ends up with reconciles across three independent read paths.

**Architecture:** Manual browser verification with Playwright as the driver, plus one signed mock-gateway
webhook per booking to make a payment succeed. Nothing is asserted from the implementation's own output
alone: every scenario is checked against a **cash invariant**, against **three separate read surfaces**
that must agree, and — for two scenarios — against arithmetic worked by hand from the published rates.

**Tech Stack:** Playwright (driver only), `curl` for the mock webhook, `psql` for ledger reconciliation,
the running storefront + dashboard.

## Global Constraints

- **NO TESTS, ever** (AGENTS.md hard rule 1 / ADR 0005). This plan creates **no** `*.spec.*` / `*.test.*`
  file, no Playwright config, no test script in any `package.json`. Playwright is used only as a browser
  driver in-session, exactly as it was for the VAT verification.
- Node ≥ 22.22.0 (`nvm use`), pnpm 10.13.1.
- Money is `bigint` VND đồng. Every figure below is đồng.
- Any temporary data change (a listing's deposit config, a commission rate) is **reverted in the same
  task that made it**, and the revert is verified.

## What is already known (do not re-derive)

Established by reading the code on 2026-08-11 — these facts shape every task:

| Fact | Consequence |
| --- | --- |
| No row in `tenant_gateway_configs` | Both tenants fall back to the **mock gateway**; `POST /webhooks/mock` with an HMAC-signed body is how a payment succeeds. |
| `MOCK_WEBHOOK_SECRET` defaults to `mock-webhook-secret` | Signature = `HMAC-SHA256(secret, "<gatewayTxnId>.<event>.<amountVnd>")`, hex. |
| `PayoutPolicy.holdingDays` defaults to 3, settable 0–90 | Set it to **0** so the release worker frees a settlement immediately instead of in three days. |
| `settlement-release.worker.ts` polls every **30 s** | After completion, wait ~30–60 s for `released`; do not conclude failure earlier. |
| Partner marks completion: `POST /partner/bookings/:id/complete` | The **partner** area drives completion, not the tenant. |
| Tenant cancels: `POST /tenant/bookings/:id/cancel` | Cancellation-fee settlements come from the tenant area. |
| Seeded hourly listings | `giang-studio` — 70 listings, **all 50 % deposit**, `online_before`. `hoang-gia-sport` (BookingStad) — 40 listings, **30 % deposit**. |
| No seeded listing has `balance_due = on_arrival` | The on-site-collection branch needs a listing flipped first (Task 6). |
| `trang-makeup` (the only VAT-exempt partner) has **0 published listings** | The 0 %-VAT branch is not reachable from the storefront without publishing one (Task 7). |
| `bookingstudio-house` is a house partner with 40 published listings | The no-partner-leg branch is reachable, but its listings are equipment/costume (inventory mode, security deposit). |
| Promotions seeded | `WELCOME10` (`funded_by = tenant`, 10 %), `PARTNER15` (`funded_by = partner`, 15 %). |

## The invariant every scenario checks

For every booking, whatever the shape:

```
partnerShare + platformFee + affiliateCommission + tenantNet  ==  final_amount (cash received)
```

`promoDiscount` is informational and sits outside that identity — on a tenant-funded promo the partner is
still paid on the **original** price, so the tenant absorbs the discount and the four legs still sum to the
smaller cash figure. This identity is independent of the split implementation, which is what makes it worth
checking.

Additionally, in `ledger_entries`, **total debit == total credit** for each `journal_id`.

## Expected figures

Computed by running the real `computeCommissionSplit` (not by hand) on 2026-08-11, for a
**280,000 ₫** booking on `studio-a-han-quoc` (partner `giang-studio`, `company_vat` → 8 % VAT),
tenant 15 % / platform 2 % / affiliate 0 unless stated:

| # | Scenario | partner | platform | affiliate | tenantNet | promo | cash |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | plain, no promo | 241,111 | 5,185 | 0 | 33,704 | 0 | 280,000 |
| S2 | `WELCOME10`, tenant-funded | 241,111 | 4,667 | 0 | 6,222 | 28,000 | 252,000 |
| S3 | `PARTNER15`, partner-funded | 204,944 | 4,407 | 0 | 28,649 | 0 | 238,000 |
| S4 | affiliate 5 % | 241,111 | 5,185 | 12,963 | 20,741 | 0 | 280,000 |
| S5 | house partner | 0 | 5,185 | 0 | 274,815 | 0 | 280,000 |
| S6 | platform rate 2 → 5 | 241,111 | 12,963 | 0 | 25,926 | 0 | 280,000 |
| S7 | VAT-exempt seller (0 %) | 238,000 | 5,600 | 0 | 36,400 | 0 | 280,000 |

Two of these are worth internalising because they are the point of the whole exercise:

- **S1 → S6** (platform 2 → 5): platform **+7,778**, tenantNet **−7,778**, partner **unchanged**. The
  platform fee comes out of the *tenant's* share and must never touch the partner.
- **S1 vs S7** (VAT on/off): with VAT the partner receives **more** (241,111 vs 238,000) and the platform
  **less** (5,185 vs 5,600), because every rate now bites on the smaller VAT-exclusive base. If VAT made
  the partner worse off, option B is wired backwards.

---

### Task 1: Environment reset and canonical ports

**Files:** none — environment only.

**Interfaces:**
- Produces: API on `:3000`, storefront on `:5173`, dashboard on `:5174`, all running current branch code.

The previous session found **three** stale dev servers (one API from 10:18 holding `:3000` with pre-VAT
code, two from Aug 6 holding `:5173`/`:5174`), which silently invalidated a verification run. Do not skip
this task — a stale server produces confidently wrong results.

- [ ] **Step 1: List every dev process for this repo**

```bash
cd "/Volumes/OVEN Duy/temp/single-test"
ps -eo pid,lstart,command | grep "single-test" | grep -vE "grep|claude"
lsof -nP -iTCP:3000 -sTCP:LISTEN; lsof -nP -iTCP:5173 -sTCP:LISTEN; lsof -nP -iTCP:5174 -sTCP:LISTEN
```

- [ ] **Step 2: Ask the human partner before killing anything they own**

Any process older than this session belongs to them. Show the list and ask which to stop. Do not kill
unilaterally.

- [ ] **Step 3: Start one clean dev stack**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use
docker compose up -d
pnpm dev
```

- [ ] **Step 4: Confirm the ports are the canonical ones**

```bash
for p in 3000 5173 5174; do echo -n "$p: "; curl -s -o /dev/null -w "%{http_code}\n" -m 5 http://localhost:$p/; done
grep -iE "EADDRINUSE|Port .* is in use" <dev log>
```

Expected: `3000` → 200, `5173`/`5174` → 30x, and **no** port-in-use line. If a port moved, go back to
Step 2 — running against a shifted port is how the last run went wrong.

---

### Task 2: Make the settlement lifecycle observable in one session

**Files:** none — tenant configuration through the UI.

**Interfaces:**
- Produces: BookingStudio payout policy with `holdingDays = 0`, so a completed booking releases within
  ~30 s instead of 3 days.

- [ ] **Step 1: Set the holding period to 0**

Log in at `http://localhost:5174` as `admin@bookingos.local` / `admin-dev-password`, switch to the
BookingStudio tenant workspace, open the tenant finance area and set the payout **holding period to 0
days** (`PUT /tenant/finance/payout-policy`). Record the previous value — Task 12 restores it.

- [ ] **Step 2: Confirm it stored**

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT slug, settings->'payout' FROM tenants WHERE slug='bookingstudio';"
```

Expected: `holdingDays` is `0`.

If the tenant finance UI exposes no such field, set it through the API with the admin session cookie
rather than editing the jsonb directly, so the value goes through the same validation the UI would use.

---

### Task 3: Establish the payment recipe (S1, the baseline)

**Files:** none.

**Interfaces:**
- Produces: a repeatable "book → pay → complete → release" recipe every later scenario reuses, and the
  first reconciled scenario (S1).

- [ ] **Step 1: Book `studio-a-han-quoc` for 1 hour**

Navigate to
`http://bookingstudio.localhost:5173/vi/checkout?listing=studio-a-han-quoc&mode=hourly&start=<UTC>&end=<UTC+1h>`
choosing a slot at least 3 days out so the free-cancellation tier is active. Fill the phone field
(`0900000123`), submit. Record the booking code.

Note the listing is **50 % deposit**, so the amount due now is 140,000 of a 280,000 booking. That is the
partial-payment case; S1's split still applies to the full 280,000.

- [ ] **Step 2: Read back the payment the mock gateway created**

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT p.id, p.status, p.amount, p.gateway, p.gateway_txn_id
     FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.code='<CODE>';"
```

Expected: one `pending` payment on gateway `mock` with a `mock_…` txn id.

- [ ] **Step 3: Sign and post the success webhook**

```bash
TXN=<gateway_txn_id>; AMT=<amount from the row>
SIG=$(node -e "console.log(require('crypto').createHmac('sha256','mock-webhook-secret').update(process.argv[1]+'.succeeded.'+process.argv[2]).digest('hex'))" "$TXN" "$AMT")
curl -s -X POST http://localhost:3000/webhooks/mock -H 'Content-Type: application/json' \
  -d "{\"gatewayTxnId\":\"$TXN\",\"event\":\"succeeded\",\"amountVnd\":\"$AMT\",\"signature\":\"$SIG\"}" -w '\n%{http_code}\n'
```

If `MOCK_WEBHOOK_SECRET` is set in the root `.env`, use that value instead of the default.

- [ ] **Step 4: Record what the settlement holds after a PARTIAL payment**

```bash
docker compose exec -T postgres psql -U postgres -d booking -x -c \
  "SELECT s.status, s.kind, s.online_held_amount, s.onsite_collected_amount, s.partner_payable,
          s.partner_gross_earning, s.tenant_commission_gross, s.tenant_net_earning, s.platform_fee
     FROM booking_settlements s JOIN bookings b ON b.id=s.booking_id WHERE b.code='<CODE>';"
```

This is an **observation**, not an assertion: write down whether `online_held_amount` is the 140,000
deposit or the full 280,000, because every later expectation about "money received" depends on it. Note it
in the results table; do not assume.

- [ ] **Step 5: Pay the balance, then complete the booking as the partner**

Pay the remaining 140,000 the same way (repeat Steps 2–3 for the second payment). Then log in to
`http://localhost:5174` as `giang@giangstudio.vn` / `demo-password`, open the booking in the partner area
and mark it **completed**.

- [ ] **Step 6: Wait for release and read all three surfaces**

Wait up to 60 s (the worker polls every 30 s), then collect the same figures from three independent paths:

1. **Settlement row** — the query in Step 4; expect `status = released`.
2. **Ledger** —
   ```bash
   docker compose exec -T postgres psql -U postgres -d booking -c \
     "SELECT e.entry_type, e.account_id, e.debit, e.credit, e.journal_id
        FROM ledger_entries e JOIN bookings b ON b.id=e.booking_id WHERE b.code='<CODE>' ORDER BY e.journal_id, e.entry_type;"
   ```
3. **UI** — the partner revenue screen (`/partner/revenue`) and the tenant finance screens
   (`/tenant/finance`, `/tenant/finance/settlements`, `/tenant/finance/ledger`).

- [ ] **Step 7: Check S1 against the table, the invariant and the ledger**

Expected, from the S1 row: partner **241,111**, platform **5,185**, affiliate **0**, tenantNet **33,704**.

Three checks, all must hold:
- `241,111 + 5,185 + 0 + 33,704 == 280,000` (cash invariant).
- Per `journal_id`, `SUM(debit) == SUM(credit)`.
- The partner revenue screen and the tenant finance screen show the **same** partner figure as the
  settlement row. A disagreement between surfaces is a real defect even if the arithmetic is right.

- [ ] **Step 8: Hand-check S1 independently of the code**

Do this arithmetic yourself and confirm it lands on the table:

```
gross 280,000 @ 8% VAT  → VAT = 280,000 × 8 / 108        = 20,741  → net = 259,259
tenant commission 15% of net                              =  38,889
partner = gross − commission = 280,000 − 38,889           = 241,111  ✓
platform 2% of net                                        =   5,185  ✓
tenantNet = 38,889 − 5,185                                =  33,704  ✓
```

If the hand figures and the table disagree, **stop** — the expectation table was generated from the same
function under test, so only this hand-check can catch a systematic error in it.

---

### Task 4: Promotion funding — who absorbs the discount (S2, S3)

**Files:** none.

**Interfaces:**
- Consumes: the Task 3 recipe.
- Produces: S2 and S3 reconciled.

`funded_by` is the one input that changes the **partner's basis**, so these two scenarios are where a
mistake would quietly move money between tenant and partner.

- [ ] **Step 1: Run the Task 3 recipe with `WELCOME10` (tenant-funded, 10 %)**

Same listing, same duration. Apply the promo code at checkout. Cash becomes 252,000.

- [ ] **Step 2: Check S2**

Expected: partner **241,111**, platform **4,667**, tenantNet **6,222**, promoDiscount **28,000**.

The point to verify: the partner is still paid on the **original 280,000** (241,111 — identical to S1),
and the tenant's take collapses from 33,704 to 6,222. The tenant funded the discount, so the tenant eats
it. Invariant: `241,111 + 4,667 + 6,222 == 252,000`.

- [ ] **Step 3: Run the recipe again with `PARTNER15` (partner-funded, 15 %)**

Cash becomes 238,000.

- [ ] **Step 4: Check S3**

Expected: partner **204,944**, platform **4,407**, tenantNet **28,649**.

The point to verify: the partner's figure **drops** (204,944 vs 241,111) because a partner-funded discount
moves the partner's basis down to the discounted price, while the tenant's take barely moves. This is the
mirror image of S2 and the two must not behave alike.
Invariant: `204,944 + 4,407 + 28,649 == 238,000`.

---

### Task 5: Affiliate and house partner (S4, S5)

**Files:** none.

**Interfaces:**
- Consumes: the Task 3 recipe.
- Produces: S4 and S5 reconciled.

- [ ] **Step 1: Book with the seeded referral code**

Repeat the recipe, entering the storefront through `?ref=R-DEMO01` (affiliate
`affiliate@bookingstudio.vn`) so attribution attaches, then check out normally.

- [ ] **Step 2: Check S4**

Expected: partner **241,111**, platform **5,185**, affiliate **12,963**, tenantNet **20,741**.

The point to verify: the affiliate's 12,963 comes **out of the tenant's share** (33,704 → 20,741), not out
of the partner's (unchanged at 241,111). Invariant: the four legs sum to 280,000.

- [ ] **Step 3: Book a house-partner listing**

Pick a published `bookingstudio-house` listing. These are inventory-mode equipment/costume items, so the
booking also carries a **security deposit** — record it separately; it is refundable and must never appear
as revenue or attract commission.

- [ ] **Step 4: Check S5**

Expected for a 280,000 service amount: partner **0**, platform **5,185**, tenantNet **274,815**.

Two things to verify: there is **no partner-payable leg at all** in the ledger, and the security deposit
appears as its own `security_deposit` entry rather than inside revenue. Note that a house partner's
platform fee is still computed on the VAT-net base.

---

### Task 6: Payment coverage — pay in full, and balance collected on arrival

**Files:** none — tenant-side listing settings, changed through the UI and reverted.

**Interfaces:**
- Consumes: the Task 3 recipe.
- Produces: the two payment shapes Task 3 does not reach — 100 % upfront, and `on_arrival`.

Every seeded hourly listing on BookingStudio is fixed at **50 % deposit, `online_before`**, so Task 3 can
only ever exercise the partial-deposit-then-online-balance shape. The other two shapes need the listing
reconfigured, which is a legitimate tenant setting change, not a data hack.

The money split must be **identical across all three** — how a customer schedules their payment cannot
change what anyone earns. Only `online_held_amount`, `onsite_collected_amount` and `partner_payable` may
differ. That invariance is the actual assertion of this task.

#### Part A — pay 100 % upfront

- [ ] **Step 1: Set the listing to full payment**

In the tenant dashboard, edit `studio-a-han-quoc` and set the deposit to **100 %** (pay in full), leaving
balance-due at `online_before`. Record that the original was `50 | online_before`.

- [ ] **Step 2: Run the Task 3 recipe — one payment, not two**

Expected at checkout: the amount due is the full **280,000**, not 140,000, and a single mock webhook
settles it. There is no balance to pay afterwards.

- [ ] **Step 3: Check the split is unchanged from S1**

Expected: partner **241,111**, platform **5,185**, tenantNet **33,704** — byte-identical to Task 3's S1.
`online_held_amount` should now be the full 280,000 and `onsite_collected_amount` 0.

If the split differs from S1, the payment schedule is leaking into the commission maths, which it must not.

#### Part B — balance collected on arrival

No seeded listing uses `balance_due = on_arrival`, so this branch has never run. It is the one place where
the partner is already holding cash and `partner_payable` must be **reduced** accordingly.

- [ ] **Step 4: Switch the listing to a 50 % deposit with on-arrival balance**

In the tenant dashboard, edit `studio-a-han-quoc` and set the balance-due to **on arrival**, keeping the
50 % deposit. Record that the original was `online_before`.

- [ ] **Step 5: Book and pay the deposit only**

Run the Task 3 recipe but stop after the deposit payment (140,000). Do **not** pay a balance online.

- [ ] **Step 6: Complete as the partner, reporting the on-site collection**

Mark the booking completed in the partner area. The completion flow should account for the 140,000 the
partner collected in person.

- [ ] **Step 7: Check the payable, not just the earning**

Expected relationships (compute the exact figures from the settlement row, since the service amount may
differ from 280,000 if you changed the slot):

- `partner_gross_earning` is unchanged from the equivalent `online_before` booking — how the customer paid
  does not change what the partner earned.
- `partner_payable == max(0, partner_gross_earning − onsite_collected_amount)`. The tenant only owes the
  partner what it actually holds.
- `onsite_collected_amount == 140,000`.
- The cash invariant still holds against the **full** service amount, not just the online part.

- [ ] **Step 8: Revert the listing**

Set `studio-a-han-quoc` back to **50 % deposit, `online_before`** — undoing both Part A and Part B — and
confirm:

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT slug, deposit_percent, balance_due FROM listings WHERE slug='studio-a-han-quoc';"
```

Expected: `50 | online_before`.

---

### Task 7: VAT-exempt seller (S7)

**Files:** none — partner/listing data, changed and reverted.

**Interfaces:**
- Consumes: the Task 3 recipe.
- Produces: S7 reconciled — the 0 %-VAT branch proven through the UI rather than only programmatically.

`trang-makeup` is the seeded VAT-exempt partner but has no published listing, so this branch has only ever
been verified through a script. Reaching it from the storefront needs a listing.

- [ ] **Step 1: Give the exempt partner something bookable**

In the tenant dashboard, either create a small hourly listing under `trang-makeup` priced at
**280,000 ₫/hour** so the figures line up with the table, or reassign and publish one. `trang-makeup` is a
`pending` partner — approve it first if the UI requires an approved partner to publish.

- [ ] **Step 2: Run the Task 3 recipe against it**

- [ ] **Step 3: Check S7**

Expected: partner **238,000**, platform **5,600**, tenantNet **36,400**, and the frozen
`commission_snapshot.tax.vatBps` is **0**.

The point to verify, against S1: the partner receives **less** (238,000 vs 241,111) and the platform
**more** (5,600 vs 5,185) when no VAT applies, because the rates now bite on the full gross. If the
direction is reversed, option B is wired backwards.

- [ ] **Step 4: Remove or unpublish the listing created in Step 1**

Leave the seed's shape intact — `trang-makeup` should end this plan with 0 published listings, as it began.

---

### Task 8: Change the commission rates and confirm the delta (S6)

**Files:** none — commission configuration through the admin and tenant UIs, reverted at the end.

**Interfaces:**
- Consumes: the Task 3 recipe, the S1 baseline.
- Produces: S6 reconciled, plus proof that a rate change does **not** retroactively move an existing booking.

This is the task the human partner asked for by name: change the % and see whether the numbers add up.

- [ ] **Step 1: Record the existing bookings' figures**

Before changing anything, note the settlement figures of the S1 booking from Task 3. They must not move.

- [ ] **Step 2: Raise the platform fee from 2 % to 5 %**

Admin area → `/admin/tenants/<BookingStudio id>` → **Phí nền tảng** → 5 → Lưu.

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT applies_to, tenant_rate, platform_rate, affiliate_rate FROM commission_rules
     WHERE tenant_id=(SELECT id FROM tenants WHERE slug='bookingstudio');"
```

Expected: every rule shows `platform_rate = 5`.

- [ ] **Step 3: Confirm the OLD booking did not move**

Re-read the Task 3 settlement. Expected: **identical** figures (platform still 5,185). A frozen
`commission_snapshot` is the whole reason this holds; if the old booking changed, snapshotting is broken
and that is a serious defect.

- [ ] **Step 4: Run the recipe again on a NEW booking and check S6**

Expected: partner **241,111**, platform **12,963**, tenantNet **25,926**.

The delta against S1 is the real assertion: platform **+7,778**, tenantNet **−7,778**, partner **unchanged**.
The platform fee is deducted from the tenant's share and must never touch the partner.

- [ ] **Step 5: Try a rate the tenant share cannot carry**

Set the platform fee to **50**. Expected: rejected with the Vietnamese message
"Phí nền tảng quá cao…", and **no** rule changed — re-run the query from Step 2 to confirm all rules still
read 5.

- [ ] **Step 6: Change the tenant's own commission and re-check**

In the tenant finance area, change the tenant commission from 15 % to 20 % on the default rule, then run
the recipe once more. Compute the expectation first, then compare:

```
net = 280,000 − 20,741 = 259,259
tenant commission 20% of net = 51,852   → partner = 280,000 − 51,852 = 228,148
platform 5% of net           = 12,963
tenantNet = 51,852 − 12,963  = 38,889
228,148 + 12,963 + 38,889    = 280,000  ✓
```

- [ ] **Step 7: Restore both rates**

Platform fee back to **2** via the admin card, tenant commission back to **15 %**. Verify:

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT applies_to, tenant_rate, platform_rate FROM commission_rules
     WHERE tenant_id=(SELECT id FROM tenants WHERE slug='bookingstudio');"
```

Expected: `tenant_default | 15 | 2`.

---

### Task 9: Money that flows backwards — cancellation, no-show, dispute refund

**Files:** none.

**Interfaces:**
- Consumes: the Task 3 recipe.
- Produces: the three non-`service_completed` settlement kinds exercised.

`SettlementKind` has three values and `SettlementStatus` six. Tasks 3–8 only ever exercise
`service_completed → held → dispute_window → released`. These are the rest.

- [ ] **Step 1: Cancel inside the free window**

Book and pay, then cancel from the customer's booking page while the free-cancellation tier is still
active. Expected: a full refund is due, no commission is earned by anyone, and no revenue journal exists —
`ledger_entries` for the booking should carry no `booking_revenue` leg.

- [ ] **Step 2: Cancel inside a penalty tier**

Book a slot close enough that a penalty tier applies (the checkout page lists the exact tier deadlines and
amounts — use them). Cancel. Expected: `kind = cancellation_fee`, the retained amount equals the tier's
stated penalty, and after release the **tenant keeps the whole retained amount** (`partner_gross_earning`
and `platform_fee` are 0 on this kind). Check that against the settlement row.

- [ ] **Step 3: No-show**

Book, pay, let the slot pass, and record a customer no-show from the partner area. Expected:
`kind = customer_no_show`, and the commission base is the **amount actually held online**, not the full
booking value. Verify the cash invariant against `online_held_amount`.

- [ ] **Step 4: Dispute leading to a refund**

Book, pay, complete, then open a customer dispute during the dispute window and resolve it as **accepted**
in the tenant area. Expected: the settlement moves through `refund_pending`, and the refund is capped at
`online_held_amount − refunded_amount`. Confirm the cap is enforced by attempting a refund larger than the
held amount and observing the rejection.

- [ ] **Step 5: Confirm every journal still balances**

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT journal_id, SUM(debit) AS d, SUM(credit) AS c FROM ledger_entries
     GROUP BY journal_id HAVING SUM(debit) <> SUM(credit);"
```

Expected: **0 rows**. A single unbalanced journal anywhere invalidates the whole run.

---

### Task 10: Payout — money actually leaving the tenant

**Files:** none.

**Interfaces:**
- Consumes: released settlements from Tasks 3–9.
- Produces: the payout leg verified, closing the loop from customer payment to partner bank account.

Everything above stops at "the tenant owes the partner". This task checks the tenant paying it.

- [ ] **Step 1: Read the partner's outstanding balance**

On `/partner/revenue`, note the payable balance. Cross-check it against the sum of `partner_payable` over
that partner's released settlements.

- [ ] **Step 2: Create and mark a payout paid**

In the tenant finance area, create a payout for `giang-studio` covering the released settlements, then mark
it paid.

- [ ] **Step 3: Verify the balance returns to zero**

Expected: a `payout` ledger entry debiting `Partner payable` / crediting tenant cash, the partner's payable
balance back to **0**, and `payout_allocations` linking the payout to the settlements it cleared. Re-run
the unbalanced-journal query from Task 9 Step 5 — still 0 rows.

---

### Task 11: Results table and defect triage

**Files:**
- Create: `docs/superpowers/plans/2026-08-11-money-flow-results.md`

**Interfaces:**
- Consumes: every observation above.
- Produces: one table a human can read in a minute, plus a defect list.

- [ ] **Step 1: Write the results table**

One row per scenario: expected partner / platform / affiliate / tenantNet, observed values from all three
surfaces, invariant pass/fail, and any surface disagreement.

- [ ] **Step 2: Record what was NOT covered**

State it plainly rather than implying full coverage. Known gaps going in: `inventory`-mode damage
deductions, `clawback` after release, multi-tenant cross-contamination (nothing here books on BookingStad),
and the `disputed` settlement status if Task 9 Step 4 resolves without passing through it.

- [ ] **Step 3: List every defect with its scenario and the exact figures**

Do not fix anything in this plan — a verification run that also edits code cannot be trusted. File the
findings; fixes get their own plan.

---

### Task 12: Restore the environment

**Files:** none.

- [ ] **Step 1: Restore the payout holding period**

Set BookingStudio's `holdingDays` back to the value recorded in Task 2 Step 1 (3 unless it differed).

- [ ] **Step 2: Confirm nothing was left changed**

```bash
docker compose exec -T postgres psql -U postgres -d booking -c \
  "SELECT applies_to, tenant_rate, platform_rate FROM commission_rules
     WHERE tenant_id=(SELECT id FROM tenants WHERE slug='bookingstudio');
   SELECT slug, deposit_percent, balance_due FROM listings WHERE slug='studio-a-han-quoc';
   SELECT settings->'payout' FROM tenants WHERE slug='bookingstudio';
   SELECT p.slug, count(l.id) FROM partners p LEFT JOIN listings l ON l.partner_id=p.id AND l.status='published'
     WHERE p.slug='trang-makeup' GROUP BY 1;"
```

Expected: `15 | 2`; `50 | online_before`; `holdingDays` back to its original; `trang-makeup` with **0**
published listings.

- [ ] **Step 3: Note the test bookings left behind**

The run creates a dozen or so bookings, payments, settlements and ledger entries in the dev database. They
are harmless but they do skew the admin dashboard's GMV figures. Tell the human partner they exist and
offer a reseed (`prisma migrate reset` needs their explicit consent) rather than deleting rows by hand —
`ledger_entries` are immutable by design and hand-deleting them would be worse than leaving them.

---

## Deliberately out of scope

- Fixing anything found. Verification and repair in one pass produces neither.
- BookingStad (the second tenant). Cross-tenant isolation of money is a separate concern and deserves its
  own plan rather than a footnote here.
- Reschedule fees, damage deductions on inventory returns, and `clawback` after release.
- Automated regression of any of this — ADR 0005 forbids it, which is precisely why this plan is written
  down: the reproduction steps *are* the regression suite.
