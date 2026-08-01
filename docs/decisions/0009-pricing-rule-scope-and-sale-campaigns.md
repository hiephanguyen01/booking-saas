# ADR 0009 — One pricing rule per scope; a sale campaign bounds the discount, not the rule

**Status:** accepted (2026-08-01)

## Context

Two defects in the partner calendar surfaced in the same session, and the fixes turned out to depend
on each other.

**A "replace" that silently inserted.** The partner calendar presents pricing as *a scope has a
price*: pick a date, or a weekday, or an hour window, set a number. Saving the same scope again was
meant to overwrite it. That contract was only ever an application-level agreement, and the check
backing it compared `params` with `JSON.stringify`.

`params` is a `jsonb` column, and **Postgres normalises jsonb key order on write**. A rule stored as
`{"to":…,"date":…,"from":…}` never string-matched the `{"date":…,"from":…,"to":…}` the form had just
built. The replace-delete therefore matched nothing, the insert went ahead, and the listing quietly
accumulated two rules for one scope — observed live in dev data. The same rules then reported "this
window overlaps" against their own twin, so the partner could neither save nor understand why. Even
with the comparison fixed, two concurrent saves would race to the same outcome.

**A sale with no end.** `sale_price` was unconditional: set it and it applied forever. A partner
cannot run "20% off if you book before Tết" without going back to delete the row by hand on the right
morning, and there was nowhere to put the campaign's *name* — so the storefront could only show an
anonymous struck-through number, which is the least persuasive form of a discount.

## Decision

**1. One pricing rule per scope, enforced by the database.**

A UNIQUE index `pricing_rules_scope_key` on `(listing_id, booking_mode, rule_type, params)`
(migration `20260731130000_pricing_rule_scope_unique`, which first collapses existing duplicates and
re-bands `priority` onto one scale). Prisma cannot express `@@unique` over a `Json` column, so the
index lives only in the migration; `schema.prisma` carries a comment pointing at it.

Because the key contains `jsonb`, **canonicalising `params` becomes mandatory rather than optional**:
`canonicalParams` (sorted keys) and `normalizeParams` (sorted `days`; an all-seven `days` on a
`time_range` dropped, since "every weekday" and "the seven weekdays I ticked" must be one scope) in
`listing/domain/entities/pricing-rule.entity.ts`. That is the only sanctioned comparison.

Overlap resolution stays explicit: `PRICING_RULE_PRIORITY` (100 recurring / 500 `date_range` /
1000 `date_time_range`) — narrowest scope wins. Note the scope of that constant: it is a **contract
convention applied by callers** (the dashboard's route actions, the seed), not something the API
enforces — the create schema still defaults `priority` to `0`. The migration re-bands existing rows
onto the scale; keeping the API permissive was deliberate, since the band is a UI policy and the
kernel only needs a total order. Within one band, collisions are **refused**, not ranked, because a
tie would resolve by array order.

**2. A campaign window bounds the sale, not the rule.**

`sale_starts_at` / `sale_ends_at` (half-open `[)`, matching `bookings.blocked_period`'s `tstzrange`
convention; NULL = unbounded that side) plus a display-only `campaign_label`. Outside the window the
rule **still applies its own regular `price`**.

The window is measured at **booking** time — "book before 31/12 for this price". Discounting
particular *stay* dates is already expressible as a `date_range` rule, so overloading the campaign
window with that meaning would have given two ways to say one thing.

`computeQuote` therefore takes a **required** `now: Date`. Defaulting it inside the kernel was
rejected deliberately: this is the only path that turns rules into money, and a default would let a
call site price against the wrong clock without anyone noticing.

## Consequences

- The API gains `PRICING_RULE_SCOPE_TAKEN` (409). Verified under concurrency: four identical parallel
  POSTs returned `201 409 409 409` with exactly one row committed.
- Both create paths (partner and tenant) now go through one `PreparePricingRuleWriteUseCase`, which
  runs inside the caller's `forTenant` transaction. Previously the tenant path had none of these
  checks — that asymmetry is how the two drifted in the first place.
- Enforcing "an hourly price window must sit inside the day's opening hours" required reading
  scheduling's tables from `listing`, but scheduling already imports `listing`, so a direct
  injection would close a module cycle. Hence `OpenHoursReaderPort`, owned by `listing`. The
  *interpretation* is not duplicated — both sides call `shared/domain/availability/open-windows`.
- A campaign expiring changes the price without anyone writing to the database, so nothing emits an
  invalidation event for it. `RedisAvailabilityCache` (TTL 60s) can therefore **display** a stale
  sale for up to a minute. Accepted: nobody is *charged* it, because the booking path re-prices with
  a live clock and `assertExpectedSubtotal` rejects a mismatched total.
- Migration `20260731130000` is destructive by design (it deletes duplicate rows, keeping the most
  recent of each scope — the partner's latest intent). It is not re-runnable against data that has
  since diverged, and like every applied migration it must never be renamed.

## Alternatives considered

- **Allow duplicate scopes, disambiguate on read** via `priority` then `created_at`. No migration, no
  409 to document — but it moves an ambiguity into the pricing path, which is the one place the
  system must be able to answer "why this number?" without a tiebreak rule.
- **Deduplicate in application code only** (fix the comparison, keep no index). Fixes the observed
  bug but not the concurrent one, and leaves the invariant restated at every call site.
- **Expire the whole rule when the campaign ends.** Simpler to reason about, but the price would fall
  back to the *listing's* base rather than the rule's regular price — so a peak-hour rule whose
  campaign ended would make peak hours suddenly cheaper than off-peak.
- **Interpret the campaign window as stay dates.** Rejected as redundant: `date_range` already says
  that, and the two readings are indistinguishable in the UI once both exist.
