# Automatic household tax-threshold implementation

## Decisions

1. The threshold is effective-dated national reference data, never a UI/domain
   literal. The current 2026 rule is 1B VND under NĐ 141/2026/NĐ-CP.
2. BookingOS cannot infer all-channel revenue. A valid assessment combines
   released platform revenue with the latest declared external revenue.
3. Missing external declaration is conservative: household bookings use the
   declaring regime until a declaration establishes below-threshold status.
4. Revenue facts are append-only and keyed by finance journal for at-least-once
   outbox safety. Release adds revenue; clawback reverses the referenced release.
5. Revenue-driven crossings are sticky for the year. Legal-rule revisions may
   move a classification both directions. Manual overrides expire at year end.
6. Existing booking tax snapshots and ledger journals are immutable.

## Delivery

- Migration: `tax_threshold_rules`, `partner_tax_year_assessments`,
  `partner_tax_revenue_events`, `partner_tax_declarations`, with FORCE RLS on all
  tenant tables.
- Partner use-cases: get assessment, record declaration, consume finance revenue,
  reassess/backfill and audited break-glass override.
- Finance producers: settlement release and clawback events emitted in the same
  transaction as their journal.
- Daily worker: one short RLS transaction per partner, released-settlement
  backfill, active-rule re-evaluation and idempotent projection update.
- Dashboard: revenue composition, progress to the live threshold, declaration
  form and an explicitly separated manual override.

## Verification without test files

Run migrations and seed twice, exercise exact-threshold / threshold-plus-one /
duplicate-event / declaration / clawback / legal-rule-revision scenarios against
the local database, then run the repository's full static check command.
