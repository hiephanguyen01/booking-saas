# Tenant Legal Documents Design

## Problem

The legal layer exists in the schema and nowhere else.

`agreement_acceptances` is already modelled — `tenant_id`, `user_id`/`partner_id`, `agreement_type`,
`version`, `accepted_at`, `ip` (`apps/api/prisma/schema.prisma:719`) — and `TONG-QUAN.md:412`
describes exactly what it is for: proof of acceptance, so a partner cannot claim "I never agreed to a
25% rate". But nothing behind it is real:

- **There is no document content anywhere.** The version recorded is a hand-edited constant,
  `CURRENT_PARTNER_TERMS_VERSION = '2026-01'`
  (`apps/api/src/modules/partner/domain/agreement-versions.ts:6`). An acceptance row points at a
  string that corresponds to no stored text. If a partner disputes a term, nobody can produce the
  document they supposedly accepted.
- **The tenant signs on the partner's behalf.** `ApprovePartnerUseCase` writes both the
  `partner_terms` and `commission_schedule` acceptance rows at *tenant approval* time
  (`apps/api/src/modules/partner/application/use-cases/approve-partner.use-case.ts:76`, built by
  `Partner.buildAgreements` at `domain/entities/partner.entity.ts:256-260`). The partner never saw a
  document and never clicked anything. This is the weakest possible evidence — it records the
  tenant's action, not the partner's consent.
- **Affiliates (CTV) record nothing at all.** `ApplyAffiliateUseCase` creates the membership and emits
  `affiliate.applied` with no acceptance whatsoever
  (`apps/api/src/modules/affiliate/application/use-cases/apply-affiliate.use-case.ts`). `AgreementType`
  has no affiliate value (`schema.prisma:69`).
- **Customers record nothing either.** Registration and checkout never mention terms. The only
  customer-facing legal page is four paragraphs of static i18n text
  (`apps/storefront/app/features/account/components/legal/terms-page.tsx`) served from
  `/:locale/account/terms` (`apps/storefront/app/routes.ts:32`) — platform boilerplate, identical for
  every tenant, authored by nobody.
- **Nothing gates a tenant on having terms.** A tenant goes live on subscription status alone
  (`resolve-tenant-by-host.use-case.ts`), so a storefront can take money from customers, recruit
  partners and pay affiliate commission without a single published term.

Under Vietnamese law the tenant is the one collecting personal data (phone numbers, partner national
IDs, payout bank details) and the one contracting with partners and affiliates. Nghị định 13/2023
requires notice and consent for that processing. Today BookingOS gives tenants no way to publish
either, and no way to prove anyone agreed.

## Owner decisions

Settled during brainstorming; these override any conflicting reading of the sections below.

1. **Hard gate.** A tenant that has not published the full required set does not serve a storefront at
   all — not a degraded one.
2. **Platform ships templates.** BookingOS provides a Vietnamese starting draft per document type;
   the tenant edits and publishes it. The gate still bites because publishing is an explicit act.
3. **Four required documents:** customer terms, privacy policy, partner terms, affiliate (CTV) terms.
   All four are gate conditions.
4. **The tenant classifies its own edits.** At publish time the tenant declares either a cosmetic fix
   (no re-acceptance) or a material change (new version, re-acceptance required).
5. **No platform moderation.** The tenant publishes directly and carries the responsibility; the
   platform keeps a full immutable history and can take a document down.
6. **Customer consent:** an explicit required tick at registration; at checkout a notice line plus a
   recorded acceptance, no second tick.
7. **No migration path.** The product has not launched. `prisma migrate reset` + reseed is the
   deployment procedure for this change.

## Architecture

A new bounded context, `apps/api/src/modules/legal/`, owns document content **and** every acceptance
record. It is the 18th context.

The readiness signal reaches `tenancy` through the outbox, never through an import. `legal` publishes
`legal.document_published`; a handler registered by `tenancy` recomputes a denormalised
`tenants.legal_ready_at`. Therefore:

- `legal` does not import `tenancy`; `tenancy` does not import `legal`. `pnpm check:module-cycles`
  stays green even after `partner` and `affiliate` start depending on `legal`.
- `ResolveTenantByHostUseCase` runs on the storefront hot path for every request. Reading a column of
  the tenant row it already fetches costs nothing; querying `legal_documents` there would add a query
  per request and a module edge.

The rejected alternatives were folding this into `tenancy` (which already carries plans,
subscriptions, domains, limits and platform health — affiliate consent does not belong there) and
leaving acceptance writes scattered across `partner`/`affiliate` (which makes "produce everything
this person ever agreed to" a three-table union).

## Data model

Two new tables, one column added to an existing table, one column added to `tenants`, three enum
values.

```prisma
enum LegalDocumentType {          // maps to the four gate documents
  customer_terms
  privacy_policy
  partner_terms
  affiliate_terms

  @@map("legal_document_type")
}

model LegalDocument {
  id               String            @id @default(uuid(7)) @db.Uuid
  tenantId         String            @map("tenant_id") @db.Uuid
  docType          LegalDocumentType @map("doc_type")
  currentVersionId String?           @map("current_version_id") @db.Uuid
  createdAt        DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([tenantId, docType])
  @@map("legal_documents")
}

model LegalDocumentVersion {
  id                String   @id @default(uuid(7)) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  documentId        String   @map("document_id") @db.Uuid
  versionNo         Int      @map("version_no")          // 1-based, per document
  title             String
  bodyMd            String   @map("body_md")
  isMaterialChange  Boolean  @default(true) @map("is_material_change")
  publishedAt       DateTime? @map("published_at") @db.Timestamptz(6)
  publishedByUserId String?  @map("published_by_user_id") @db.Uuid
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([documentId, versionNo])
  @@index([tenantId])
  @@map("legal_document_versions")
}
```

**Draft state is `published_at IS NULL`.** At most one draft row per document; a partial unique index
enforces it (`CREATE UNIQUE INDEX ... ON legal_document_versions (document_id) WHERE published_at IS
NULL`). This mirrors `listing_revisions` (ADR 0007) rather than inventing a second revision idiom.

A published row is **immutable** except for the cosmetic-fix path (below), which rewrites `title` and
`body_md` in place and leaves `version_no` alone. That is the whole point of the tenant's
classification: a typo fix does not fork the evidence chain, a term change does.

**`agreement_acceptances` gains one nullable column:**

```prisma
  documentVersionId String? @map("document_version_id") @db.Uuid
```

An acceptance of one of the four documents points at the exact version row that was on screen. The
two pre-existing acceptance types keep working untouched: `commission_schedule` and `promo_funding`
leave it `NULL` and continue to use the free-text `version` column. `AgreementType` gains
`customer_terms`, `privacy_policy` and `affiliate_terms`.

**Two enums, on purpose.** `AgreementType` answers "what did this person agree to" and must keep
covering `commission_schedule` and `promo_funding`, neither of which is a tenant-authored document.
`LegalDocumentType` answers "what does a tenant publish" and is exactly the four gate documents.
Collapsing them would let a row claim a `promo_funding` document exists. The four overlapping names
are the same strings, and `legal` owns the mapping between them in one place.

**`tenants` gains `legal_ready_at timestamptz NULL`** — set when all four documents have a published
version, cleared when any is missing or taken down.

Both new tables are tenant-scoped, so both need `tenant_id uuid NOT NULL` plus the hand-written
FORCE-RLS + `tenant_isolation` policy migration (ADR 0004), or
`pnpm --filter=@booking/api check:rls` fails in CI. Migration directory:
`apps/api/prisma/migrations/20260731120000_tenant_legal_documents/`.

## The hard gate

`ResolveTenantByHostUseCase` computes `live` from tenant status and subscription today. One
conjunct is added:

```ts
const live = tenant.status === 'active'
  && evaluation.storefrontLive
  && tenant.legalReadyAt !== null;
```

The storefront already has the full downstream path: `tenantUnavailableResponse` returns HTTP 423
with `code: 'TENANT_UNAVAILABLE'` (`apps/storefront/app/lib/tenant-availability.ts`). No new plumbing.

Three boundaries on the gate, each deliberate:

- **The dashboard is never gated.** Gating it would lock the tenant out of the only screen where they
  can publish the documents that would unlock them.
- **Public legal pages are never gated.** A storefront that has gone dark must still serve the
  documents people have already accepted. Otherwise taking one document down erases everyone's
  ability to read the terms they are bound by.
- **A newly created tenant starts dark.** `CreateTenantUseCase` seeds four *drafts* from the
  templates. Auto-publishing on the tenant's behalf would make the gate decorative — nobody would
  ever have read the document their business is operating under.

## Templates and seeding

Templates are static Vietnamese Markdown shipped with the API — one file per `LegalDocumentType`,
under `apps/api/src/modules/legal/domain/templates/`. They carry placeholder tokens (`{{tenantName}}`,
`{{tenantEmail}}`, `{{commissionNote}}`) substituted at draft-creation time. They are starting text,
not a live dependency: once a draft exists it is the tenant's copy and template edits never reach it.

Seeding follows the existing scope split:

| Scope | Behaviour |
| --- | --- |
| `SEED_SCOPE=tenants` (production) | Create the four documents as **drafts**. The real tenant owner must read and publish. `legal_ready_at` stays null; the storefront is dark until they act. |
| dev / staging (default) | Create **and publish** all four for `bookingstudio` and `bookingstad`, `published_by_user_id` = the seeded tenant owner. Without this, `pnpm dev` brings up two dark demo storefronts. |

This lands in `apps/api/prisma/seed/tenants/booking-studio.ts` and `booking-stad.ts`, which already
own per-tenant settings, with the shared publishing helper next to them.

## Tenant authoring

A new **"Pháp lý"** tab in `apps/dashboard/app/routes/tenant/settings.tsx`, which is already a
`Tabs` shell (brand / domains / operations / payments / payouts) with a `SETTINGS_TAB_BY_FORM` map
for action routing. One card per document type showing status (never published / published vN /
draft pending), a Markdown editor with preview, and the published-version history.

Publishing opens a dialog that forces the classification and states the consequence in plain
Vietnamese:

- *Sửa lỗi chính tả / trình bày* — rewrites the current published version in place. `version_no`
  unchanged, nobody re-accepts.
- *Thay đổi điều khoản* — creates version `n+1`, `is_material_change = true`, and triggers
  re-acceptance for partners and affiliates.

The tenant overview page gains a readiness card — "Storefront chưa lên sóng — còn thiếu 2/4 tài
liệu" — linking into the tab. Given a hard gate, discovering the reason must not require reading
docs.

New permission `tenant.legal.manage`; the global guard is deny-by-default so it must be declared on
every route. Write routes also carry `RequireActiveSubscriptionGuard`, consistent with the rest of
tenant settings.

## Consent capture

| Gate | Types recorded | Where |
| --- | --- | --- |
| Customer registration | `customer_terms` + `privacy_policy` | Required tick on the email step of the storefront register flow; rows written when the user is created |
| Checkout | `customer_terms` | Notice line + link, no tick; row written inside the booking-creation transaction |
| Partner application | `partner_terms` | Required tick in the apply form; row written in `ApplyAsPartnerUseCase` |
| Affiliate (CTV) application | `affiliate_terms` | Required tick in the apply form; row written in `ApplyAffiliateUseCase` |

Every row carries `document_version_id` and the request IP, and is written **inside the same
`forTenant` transaction as the action it belongs to**. There is no state in which a partner exists
without their signature.

Guest checkout needs no special case: `CreateBookingUseCase.resolveCustomer` provisions a user for a
guest before the booking is written (`create-booking.use-case.ts:415-425`), so `user_id` on the
acceptance row is always populated and the consent is attributable to a person.

The client submits the `documentVersionId` it displayed; the use case re-reads the document's
`current_version_id` and rejects a mismatch rather than silently recording the current version. A
stale form must not produce a signature for text the person never saw.

**The tenant-signs-for-the-partner bug is fixed here**: `partner_terms` moves out of
`ApprovePartnerUseCase` into `ApplyAsPartnerUseCase`, and `Partner.buildAgreements` stops emitting it.
`commission_schedule` stays at approval time and keeps the hard-coded constant — the commission rate
is set by the tenant during approval, so wiring partner consent to it is a separate change. Recorded
as remaining debt in "Out of scope".

## Re-acceptance

Publishing with `is_material_change = true` emits `legal.document_published` (payload: `docType`,
`documentId`, `versionId`, `versionNo`, `isMaterialChange`). Two handlers:

- `tenancy` recomputes `legal_ready_at`. This handler runs for **every** publish, material or not,
  because a first publish is what opens the gate.
- `notification` emails active partners (`partner_terms`) or active affiliates (`affiliate_terms`)
  that the terms changed. No bulk mail for `customer_terms` / `privacy_policy` — a tenant may have
  thousands of customers, and the checkout notice covers them.

"Has not accepted the current version" = the person's newest acceptance row for that type has a
`document_version_id` other than the document's `current_version_id`. One read port, one query.

Enforcement is deliberately two-layer:

1. **UI** — the partner-area and affiliate-area layout loaders in the dashboard call
   `GET /me/legal/pending` and redirect to a read-and-accept screen when it returns anything.
2. **API** — `RequireCurrentAgreementGuard`, exported by `legal` and imported by `partner` and
   `affiliate` (importing another module's guard is explicitly allowed), applied to the **write**
   routes of those two scopes. Read routes stay open so someone who has not yet accepted can still
   see their own data.

A loader redirect alone is not enforcement — the dashboard's own actions call the API server-side,
and any other caller bypasses the UI entirely.

Customers are never blocked: the next checkout shows the notice again and records an acceptance
against the new version.

## Public pages

New storefront route `/:locale/legal/:docSlug` with Vietnamese slugs — `dieu-khoan-su-dung`,
`chinh-sach-bao-mat`, `dieu-khoan-doi-tac`, `dieu-khoan-ctv` — rendering the Markdown sanitised
server-side. Adding a version segment (`/v/:versionNo`) serves a specific historical version, which is
what an acceptance record links to.

Markdown, not rich-text HTML: tenant-authored HTML rendered on the storefront would have to clear
`pnpm --filter=@booking/storefront security`, and storing markup the tenant can inject into their own
customers' browsers is not a fight worth taking for a text document.

Each document is single-language (Vietnamese) and renders as authored on every locale route,
including `/en`. Multilingual legal text is a later phase; a half-translated contract is worse than an
untranslated one.

Two existing surfaces change:

- **`site-footer.tsx`** links the four documents (currently one static `footer.aboutLinks.terms`
  entry).
- **`/:locale/account/terms`** changes role: from static i18n prose to "the terms I have accepted" —
  type, version, date, and a link to that exact text. `ListPartnerAgreementsUseCase` already does this
  for partners; the read generalises to customers and affiliates.

**The platform landing keeps its static i18n page.** A single-label host (`localhost`) or bare IP
resolves to no tenant, so there is no tenant document to serve; that page is BookingOS speaking for
itself.

## Contracts and endpoints

Zod schemas in `packages/contracts` (`src/contracts/legal.ts`).

| Endpoint | Auth |
| --- | --- |
| `GET /public/legal` · `GET /public/legal/:docType` · `GET /public/legal/:docType/versions/:versionNo` | `@Public()` |
| `GET /tenant/legal` · `PUT /tenant/legal/:docType/draft` · `POST /tenant/legal/:docType/publish` · `DELETE /tenant/legal/:docType/draft` | `tenant.legal.manage` |
| `GET /me/legal/pending` · `POST /me/legal/accept` · `GET /me/legal/acceptances` | `@AuthenticatedOnly()` |

The `/public/legal` routes have no tenant context of their own; they resolve the tenant from
`x-forwarded-host` exactly as `PublicTenantController` does, then read through
`TenantDbService.forTenant`. Only published versions are served — a draft is never reachable from a
public route.

`PublicTenantResponse` (`packages/contracts/src/contracts/tenancy.ts:422`) gains an optional
`unavailableReason` so the 423 page can distinguish "chưa hoàn thiện điều khoản" from a lapsed
subscription.

## Out of scope

- **`commission_schedule` consent.** Still recorded by the tenant at approval against a hard-coded
  version string. The document/version machinery built here is what a later change would hang it on.
- **`promo_funding`** is per-promotion, not a tenant-authored document; untouched.
- **Platform-level terms** (BookingOS ↔ tenant owner, accepted at tenant signup) — same tables would
  serve it, but the platform scope is a separate decision.
- **Multilingual documents**, PDF export, e-signature, and platform moderation of tenant text.

## Verification

No tests (ADR 0005). Verification is the static gate plus running the app:

```
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build \
  && pnpm --filter=@booking/api check:rls
```

Then `pnpm --filter=@booking/api exec prisma migrate reset`, reseed, and walk the paths manually:

1. `bookingstudio.localhost:5173` serves normally (dev seed publishes all four).
2. Unpublish one document in the tenant dashboard → the storefront returns the 423 page, the
   dashboard stays reachable, and `/legal/dieu-khoan-su-dung` still renders.
3. Republish → storefront live again.
4. Apply as partner and as CTV → the tick is required, and `agreement_acceptances` holds a row with a
   real `document_version_id` and IP.
5. Publish `partner_terms` as a material change → the partner is redirected to the accept screen and
   a partner write route returns the guard's error until they accept.
6. Cosmetic fix → `version_no` unchanged, nobody is asked to re-accept.
