# ADR 0008 — A version is the agreement; translations are renderings of it

**Status:** accepted (2026-07-31)

## Context

`agreement_acceptances` had existed since the first schema, and `TONG-QUAN.md` §7.2 explained exactly
what it was for: proof, so a partner cannot claim "I never agreed to a 25% rate". Nothing behind it
was real.

- **No document existed anywhere.** No table, column or file held the text of any terms. The `version`
  column was satisfied by two hand-edited constants, `CURRENT_PARTNER_TERMS_VERSION = '2026-01'` and
  `CURRENT_COMMISSION_SCHEDULE_VERSION = '2026-01'`. A row saying a partner accepted `partner_terms`
  version `2026-01` was unfalsifiable — nobody could produce what `2026-01` said.
- **The tenant signed on the partner's behalf.** The only writer of a `partner_terms` acceptance was
  `ApprovePartnerUseCase`, at *tenant approval* time, stamped with `ctx.userId` — the tenant staff
  member who clicked approve. Read literally, the record claimed a tenant employee had accepted the
  partner terms.
- **Affiliates and customers recorded nothing at all**, and `AgreementType` had no value for them.
- **Nothing gated a tenant on having terms**, so a storefront could take money, onboard partners and
  pay affiliate commission with no terms of service and no privacy notice — while the tenant is the
  party collecting phone numbers, partner national-ID documents and payout bank details, which
  Nghị định 13/2023 requires notice and consent for.

The owner's decision for this phase: a tenant that has not published its terms does not serve a
storefront at all.

## Decision

### A version is the agreement; a translation is one rendering of it

Text lives in `legal_document_translations`, keyed `(version_id, locale)` — one level **below** the
version, not on it.

`vi` and `en` of version 3 are one contract expressed twice, not two contracts. If `locale` sat on the
version row, an acceptance would point at "the Vietnamese row", and there would be no way to state
that an English reader agreed to the same thing. It would also double `version_no` bookkeeping on
every publish.

An acceptance therefore records **both** the version (what was agreed) and `accepted_locale` (which
rendering was on screen). "They agreed to v3" and "they agreed to v3 in English" are different claims,
and the second is the one worth defending.

### Every publish creates a new version; immutability has exactly one carve-out

A published row is never rewritten, so the text someone accepted can always be reproduced. The
cosmetic-vs-material distinction is carried by `is_material_change` and decides *who re-accepts*, not
whether history is kept. The re-acceptance bar is the newest **material** version, so a tenant can fix
a comma without dragging every partner through an acceptance screen.

Once a version is published: **adding a locale it never had is allowed** (nobody has read it; it only
widens who can), **editing a translation that already exists is not** (someone may have accepted
against that exact text). Correcting a bad translation is a publish like any other.

### Readiness crosses module lines as a payload, not a query

`legal` computes `{legalReady, publishedCount}` itself and emits `legal.readiness_changed`; the
`tenancy` handler writes two columns and imports nothing from `legal`.

This is forced, not stylistic. `legal` imports `tenancy` for `RequireActiveSubscriptionGuard` and host
resolution, and the module-cycle guard builds its graph from **every** relative import including
`import type` — so a single `tenancy → legal` import closes the cycle and fails CI. The same
constraint produced two more indirections: new-tenant draft seeding rides the `tenant.created` event
`tenancy` already emitted, and customer-registration consent rides a `user.registration_consent` event
because `identity-access → legal` is likewise a cycle (and user creation runs on the admin pool
outside any transaction anyway).

The handler is a guarded compare-and-set on `legal_readiness_applied_at`, because outbox delivery is
at-least-once **and out of order**: a retried stale snapshot would otherwise re-stamp `legal_ready_at`
after a withdrawal cleared it, reopening the gate permanently.

### The gate is one conjunct, and the dashboard is exempt

`live = status active && subscription live && legal_ready_at !== null` in `ResolveTenantByHostUseCase`.
Checkout and booking creation already branch on `tenant.live`, so they are covered for free.

The dashboard is deliberately **not** gated — locking a tenant out of the only screen that can publish
its documents would be a trap. Public legal pages are also exempt: a dark storefront must still serve
the terms people already agreed to.

### Markdown, rendered as React elements, with no dependency

Tenant-authored content is Markdown, rendered by a hand-written restricted-subset renderer that emits
React elements and supports headings, paragraphs, lists, bold, italic and http(s) links only.

The original justification — "HTML would have to survive the storefront security gate" — turned out to
be false: `check-storefront-security.mjs` checks bounded form parsing and credentials in URLs, and says
nothing about HTML injection. No markdown or sanitizer library exists in the repo either (`marked` is a
transitive dependency of `react-email`, unreachable from the frontends under pnpm's isolated
`node_modules`). Emitting elements makes injection impossible **by construction** rather than resting
on an unenforced convention, and adds no dependency.

## Consequences

- The tenant, not the platform, owns and publishes the content; the platform ships editable
  Vietnamese and English templates and keeps an immutable history.
- A new tenant starts dark with four drafts. Auto-publishing on its behalf would make the gate
  decorative — nobody would have read the document their business operates under.
- `partner`'s private `AGREEMENT_REPOSITORY` was deleted; `legal` owns every document-backed
  acceptance. `promotions`' `promo_funding` recorder and `notification`'s raw-SQL read stay where they
  are, because folding either in would create a cycle.
- `commission_schedule` is still recorded by the tenant at approval against a hard-coded version
  string. `TONG-QUAN.md` §7.2 wants the partner to re-accept when a commission rule changes; that needs
  commission rules to be versioned, which is separate work. This is the known remaining gap.
- Changing a tenant's `default_locale` does not recompute readiness, so a tenant could switch its
  declared default language to one its documents lack and stay live. Recorded as debt in
  [`features/legal-documents.md`](../features/legal-documents.md).
