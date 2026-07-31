# Tenant Legal Documents Design

## Problem

The legal layer was designed but never built. What exists is a table with nothing to point at.

`agreement_acceptances` is in the schema (`apps/api/prisma/schema.prisma:719`) with `tenant_id`,
`user_id`/`partner_id`, `agreement_type`, `version`, `accepted_at` and `ip` — exactly the proof-of-
acceptance shape `TONG-QUAN.md:412` calls for. But:

- **There is no document.** No table, column or file holds the text of any terms. `version` is
  satisfied by two hard-coded constants, `CURRENT_PARTNER_TERMS_VERSION = '2026-01'` and
  `CURRENT_COMMISSION_SCHEDULE_VERSION = '2026-01'`
  (`apps/api/src/modules/partner/domain/agreement-versions.ts`). A row saying a partner accepted
  `partner_terms` version `2026-01` is unfalsifiable — nobody can produce what `2026-01` said.
- **The tenant signs on the partner's behalf.** The only writer of `partner_terms` acceptance is
  `ApprovePartnerUseCase` (`apps/api/src/modules/partner/application/use-cases/approve-partner.use-case.ts:76`,
  rows built in `apps/api/src/modules/partner/domain/entities/partner.entity.ts:256-260`). The
  partner never saw a checkbox; the tenant clicking "approve" is what records their consent. This is
  the exact dispute the design set out to prevent, inverted.
- **Affiliates and customers record nothing at all.** `ApplyAffiliateUseCase`
  (`apps/api/src/modules/affiliate/application/use-cases/apply-affiliate.use-case.ts`),
  `ApplyAsPartnerUseCase` and every customer registration and checkout path write zero acceptance
  rows. `AgreementType` has no `affiliate_terms`, `customer_terms` or `privacy_policy` value
  (`apps/api/prisma/schema.prisma:69`).
- **The public terms page is platform boilerplate.** `/:locale/account/terms`
  (`apps/storefront/app/routes.ts:32`) renders four static i18n strings
  (`apps/storefront/app/features/account/components/legal/terms-page.tsx`). Every tenant serves the
  same text, which no tenant wrote and none is bound by.

So a tenant can run a marketplace — take bookings, onboard partners, pay affiliate commissions —
with no terms of service, no privacy notice, and no evidence anyone agreed to anything. Under Nghị
định 13/2023 the privacy notice alone is not optional: tenants collect phone numbers, partner
national-ID documents and payout bank details.

## Owner decisions

Settled during brainstorming; these are the constraints the design must satisfy, not options.

1. **Hard gate.** A tenant missing any required document does not serve a storefront at all. Not
   degraded, not read-only — dark.
2. **Platform ships templates.** BookingOS provides a Vietnamese draft per document type. The tenant
   edits and publishes it. The gate still bites because publishing is an explicit act.
3. **Four required documents:** customer terms, privacy policy, partner terms, affiliate (CTV) terms.
   Missing any one closes the storefront.
4. **The tenant classifies its own edits.** At publish time it declares either a cosmetic fix (no
   re-acceptance) or a material change (new version, everyone re-accepts).
5. **No platform moderation.** The tenant publishes directly and owns the content. The platform keeps
   an immutable history and can take a document down.
6. **Customer consent:** a required tick at registration; at checkout only a notice line plus a
   silently recorded acceptance.
7. **No migration path.** The app has not launched. Deploy is `prisma migrate reset` + reseed.
8. **Architecture:** a new `legal` bounded context owns document content and all acceptances;
   storefront readiness reaches `tenancy` through the outbox.

9. **Multi-language.** A document is stored in every locale the platform serves and each visitor is
   shown their own language. The storefront is already localized per route (`/:locale/…`) and
   `localeSchema` is `['vi', 'en']` (`packages/contracts/src/contracts/common.ts:5`); serving an
   English-speaking customer a Vietnamese contract and calling it consent does not hold up.

One choice made inside the design rather than asked:

- **Markdown, not HTML.** Free HTML from a tenant would have to survive
  `pnpm --filter=@booking/storefront security`. Markdown stored, sanitized at render.

## Data model

Three new tables, all tenant-scoped, plus new columns on two existing tables.

```prisma
enum LegalDocumentType {
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
  versionNo         Int      @map("version_no")
  isMaterialChange  Boolean  @default(false) @map("is_material_change")
  publishedAt       DateTime? @map("published_at") @db.Timestamptz(6)
  publishedByUserId String?  @map("published_by_user_id") @db.Uuid
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([documentId, versionNo])
  @@map("legal_document_versions")
}

model LegalDocumentTranslation {
  id        String   @id @default(uuid(7)) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  versionId String   @map("version_id") @db.Uuid
  locale    String                                  // localeSchema: 'vi' | 'en'
  title     String
  bodyMd    String   @map("body_md")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([versionId, locale])
  @@index([tenantId])
  @@map("legal_document_translations")
}
```

**A version is the agreement; a translation is one rendering of it.** The text hangs off a row below
the version rather than on it, because `vi` and `en` of version 3 are one contract expressed twice,
not two contracts. Putting `locale` on the version row would make an acceptance point at "the
Vietnamese row", leaving no way to say that an English reader agreed to the same thing — and it would
double `version_no` bookkeeping for every publish.

Immutability extends to translations, with exactly one carve-out. Once a version is published:

- **Adding a locale that was missing is allowed.** Attaching English to a version published
  Vietnamese-only changes nothing anyone has read; it only widens who can read it.
- **Editing a translation that already exists is not.** Someone may have accepted against that text.
  Fixing a bad translation is a publish like any other — a new version, marked cosmetic if the
  Vietnamese meaning did not move.

So every row any person could ever have read stays reproducible, which is the only property that
makes an acceptance record worth storing.

**Draft = `published_at IS NULL`.** At most one draft per document, enforced by a partial unique
index on `(document_id) WHERE published_at IS NULL`. Publishing stamps `published_at`,
`published_by_user_id` and repoints `legal_documents.current_version_id`. A published row is never
updated again — this is the same shape as `listing_revisions`
(`docs/decisions/0007-listing-edit-revisions.md`), so the codebase already has the pattern and the
reviewer already has the mental model.

**Every publish creates a new version row**, cosmetic or not — a published row is never rewritten, so
the text someone accepted can always be produced. The cosmetic/material distinction (decision 4) is
carried by `is_material_change`, and it changes who must re-accept, not whether history is kept:

- **cosmetic** — new row, `is_material_change = false`, `current_version_id` moves. Nobody re-accepts.
- **material** — new row, `is_material_change = true`. The re-acceptance bar moves with it.

The consequence is that "has this user accepted the current text?" is **not** an id comparison. The
bar is the newest *material* version:

```
pending  ⟺  max(accepted version_no for this doc_type)
             < max(version_no where is_material_change) for this doc_type
```

A tenant fixing a typo therefore republishes freely without dragging every partner through an
acceptance screen, and the storefront still serves the corrected text immediately.

**`agreement_acceptances` gains two nullable columns**: `document_version_id uuid NULL`, FK to
`legal_document_versions` with `ON DELETE RESTRICT` — an accepted version can never be deleted out
from under its own evidence — and `accepted_locale text NULL`, the language actually rendered on
screen when the person clicked. Version alone does not identify what someone read once a version has
two renderings; "they agreed to v3" and "they agreed to v3 in English" are different claims, and the
second is the one worth defending. The existing `version` string column stays and is still the only
identifier for `commission_schedule` and `promo_funding`, which are not documents. `AgreementType`
gains `customer_terms`, `privacy_policy`, `affiliate_terms`.

**`tenants` gains `legal_ready_at timestamptz NULL`** — see the gate below.

All three new tables require `tenant_id uuid NOT NULL` and a hand-written RLS migration (FORCE RLS +
`tenant_isolation` policy) or `pnpm --filter=@booking/api check:rls` fails in CI. That includes
`legal_document_translations`, whose `tenant_id` is redundant against its parent version and is
carried anyway because the RLS check is per-table. Migration
`apps/api/prisma/migrations/20260731120000_tenant_legal_documents/migration.sql`, hand-authored per
[ADR 0004](../../decisions/0004-hand-written-migrations.md).

## Hard gate

`ResolveTenantByHostUseCase`
(`apps/api/src/modules/tenancy/application/use-cases/resolve-tenant-by-host.use-case.ts`) already
computes the storefront's liveness from tenant status and subscription. One term is added:

```ts
const live = tenant.status === 'active'
  && evaluation.storefrontLive
  && tenant.legalReadyAt !== null;
```

The storefront already knows what to do with `live: false` — `tenantUnavailableResponse`
(`apps/storefront/app/lib/tenant-availability.ts`) returns HTTP 423 `TENANT_UNAVAILABLE`. No new
plumbing; the gate reuses the expiry path.

`legal_ready_at` is denormalized onto `tenants` deliberately. Host resolution runs on the admin pool
before any tenant context exists and is the hottest path in the system; the tenant row is fetched
there already, so reading one more column costs nothing, whereas querying `legal_documents` would add
a round trip to every storefront request. The column only changes when a document is published or
withdrawn, so drift risk is low, and both events go through the same use case.

**Only the tenant's `defaultLocale` is required to open the gate** (`tenants.default_locale`, default
`vi`). Requiring a complete `vi` + `en` set would hold a Vietnamese studio's storefront hostage to an
English translation it has no customers for. A missing locale degrades to a fallback (see Public
pages); a missing document closes the site.

**The dashboard is not gated.** Gating it would trap a tenant outside the only screen where it can
fix the problem. Storefront dark, dashboard open, banner loud.

**The public legal pages are not gated either** (see below).

## Module boundaries

`apps/api/src/modules/legal/` — the 18th bounded context, laid out `domain/` · `application/` ·
`infrastructure/` like its neighbours, one exported `@Injectable XxxUseCase` per file with a single
public `execute()`.

The gate crosses a module line, so it goes through the outbox
([ADR 0003](../../decisions/0003-outbox-for-inter-module.md)). Publishing or withdrawing emits, inside
the same `forTenant` transaction as the write:

```
legal.document.published    { docType, documentId, versionId, versionNo, isMaterialChange }
legal.document.withdrawn    { docType, documentId }
```

Two registered handlers:

- `tenancy` recomputes `legal_ready_at`: set to `now()` when all four types have a
  `current_version_id` **whose translation set covers the tenant's `defaultLocale`**, cleared
  otherwise.
- `notification` emails active partners (on `partner_terms`) or active affiliates (on
  `affiliate_terms`) when `isMaterialChange` is true. **No fan-out for `customer_terms` /
  `privacy_policy`** — a tenant can have thousands of customers and they are handled at their next
  booking instead.

`legal` imports nothing from `tenancy`, `partner` or `affiliate`. Those modules import `legal`'s
guard and read port, which is sanctioned (guards and decorators cross freely; a use case or
repository *port* may be injected for a synchronous read). The graph stays acyclic for
`pnpm check:module-cycles`.

## Templates and seeding

Templates live in the API as plain constants, one Markdown string per `LegalDocumentType` **per
locale** (`vi` and `en`), versioned in git with the code that ships them. They are drafts, never
auto-published content. A tenant that never touches the English draft simply publishes without it and
falls back; a tenant that wants it has a starting point rather than a blank editor and a translation
bill.

Seeding follows the existing scope split (`AGENTS.md` → Seed scopes):

| Scope | Behaviour |
| --- | --- |
| `SEED_SCOPE=tenants` (production) | Creates the four documents as **drafts**. The real tenant owner must read and publish. The gate has teeth. |
| dev / staging (default) | Creates them **published**, so `bookingstudio.localhost` and `bookingstad.localhost` are live after `pnpm dev`. |

Document seeding belongs in `apps/api/prisma/seed/tenants/booking-studio.ts` and `booking-stad.ts`,
alongside the other tenant settings, not in `demo/`.

`CreateTenantUseCase` seeds the four drafts for every new tenant in its existing transaction. A new
tenant's storefront is therefore dark until its owner publishes — which is the intended behaviour,
not a regression.

## Tenant authoring

A **"Pháp lý"** tab in `apps/dashboard/app/routes/tenant/settings.tsx`, which is already tab-based
(brand / domains / operations / payments / payouts) with `SETTINGS_TAB_BY_FORM` routing form
submissions back to their tab. Four cards, one per document type, each showing state (no draft /
draft pending / published v*n*), a Markdown editor with preview, and the published history.

Inside a card, a locale switch (`Tiếng Việt` / `English`) swaps which translation the editor is
editing; both belong to the same draft and publish together. The card labels a locale that has no
text — *"Chưa có bản tiếng Anh — khách xem tiếng Anh sẽ thấy bản tiếng Việt"* — so the fallback is a
visible choice rather than a silent gap. The tenant's `defaultLocale` is marked required and blocks
the publish button when empty.

Publishing opens a dialog that forces the decision from constraint 4:

- **Sửa lỗi chính tả / trình bày** — new version, `is_material_change = false`. Live immediately,
  nobody re-accepts.
- **Thay đổi điều khoản** — new version, `is_material_change = true`. Re-acceptance flow fires.

The tenant overview screen gets a readiness card — *"Storefront chưa lên sóng — còn thiếu 2/4 tài
liệu"* — linking into the tab. Without it a tenant sees a dead site and no explanation.

New permission `tenant.legal.manage` (the global guard is deny-by-default; an undeclared route is
403). Write routes carry `@UseGuards(RequireActiveSubscriptionGuard)` like every other tenant
settings write.

## Consent capture

| Gate | Types recorded | Where |
| --- | --- | --- |
| Customer registration | `customer_terms`, `privacy_policy` | Required tick at the email step of the storefront register flow; rows written when the user is created |
| Checkout | `customer_terms` | Notice line only; row written inside the booking-creation transaction |
| Partner application | `partner_terms` | Required tick in the form; row written in `ApplyAsPartnerUseCase` |
| Affiliate application | `affiliate_terms` | Required tick in the form; row written in `ApplyAffiliateUseCase` |

Every row carries `document_version_id`, `accepted_locale` and `ip`, and is written in the **same**
`forTenant` transaction as the action it authorizes. A partner that exists without a signature is not
a state the database can reach.

The client sends the `documentVersionId` and locale it displayed; the use case rejects the submission
if the version is not the document's `current_version_id`. This catches the stale-tab case where
someone reads v3, the tenant publishes v4, and the submit would otherwise record consent to text the
user never saw.

**Fix to existing behaviour:** `partner_terms` moves out of `ApprovePartnerUseCase`
(`approve-partner.use-case.ts:76`) into `ApplyAsPartnerUseCase`. Approval keeps writing
`commission_schedule` only.

## Re-acceptance

A user is pending when their newest accepted `version_no` for a type is below the newest **material**
`version_no` for that type (see Data model). Comparing against `current_version_id` instead would
drag every partner through an acceptance screen over a typo fix. One read port, one query.

Partners and affiliates are blocked at two layers, on purpose:

- **UI** — the partner-area and affiliate-area layout loaders in the dashboard call
  `GET /me/legal/pending` and redirect to a read-and-accept screen when it returns anything.
- **API** — `RequireCurrentAgreementGuard`, exported by `legal`, applied to **write** routes in the
  partner and affiliate scopes. Read routes stay open so a blocked user can still see their own data.

The loader alone is not enough: the dashboard is a BFF, and a write action that skips the redirected
route would otherwise proceed unsigned.

Customers are never blocked. At the next checkout the notice line reappears and a fresh acceptance
row is recorded against the new version, which is what "ghi nhận ngầm" means in constraint 6.

## Public pages

New storefront route `/:locale/legal/:docSlug`, with Vietnamese slugs — `dieu-khoan-su-dung`,
`chinh-sach-bao-mat`, `dieu-khoan-doi-tac`, `dieu-khoan-ctv` — rendering the current published
Markdown, sanitized server-side. The site footer
(`apps/storefront/app/features/site-shell/components/site-footer.tsx`) links all four.

**Locale resolution** is one rule, applied identically on the public page and at every consent gate:
the route's `:locale`, falling back to the tenant's `defaultLocale`, which is guaranteed to exist
because the gate requires it. When the fallback fires, the page renders a notice above the document —
*"Bản tiếng Anh chưa có. Đây là bản tiếng Việt đang có hiệu lực."* — and `Content-Language` reports
the language actually served, not the one requested. A contract silently appearing in the wrong
language is how someone ends up agreeing to something they could not read.

The consent gates resolve the same way and record `accepted_locale` as whatever was rendered,
fallback included. The record then states plainly that a `/en` visitor accepted the Vietnamese text.

Three further rules that are easy to get wrong:

1. **Legal pages bypass the hard gate.** A dark storefront must still serve its terms; someone who
   already signed needs to reread what they signed, and withdrawing one document must not hide the
   other three.
2. **The platform landing keeps its static i18n text.** A single-label host (`localhost`) or bare IP
   resolves to no tenant at all, so there is no tenant document to serve. That page is BookingOS
   speaking for itself.
3. **`/account/terms` changes meaning** — from static prose to *"điều khoản tôi đã đồng ý"*: type,
   version number, date, and a link to that exact version's text.
   `ListPartnerAgreementsUseCase` (`apps/api/src/modules/partner/application/use-cases/list-partner-agreements.use-case.ts`)
   already does this for partners; it generalizes to customers and affiliates.

Reading a superseded version by id must keep working forever — that is the whole point of keeping
published rows immutable.

## API surface

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /public/legal` | `@Public()` | Published documents for the host's tenant (list) |
| `GET /public/legal/:docType?locale=` | `@Public()` | Current published version, resolved locale + `servedLocale` in the response |
| `GET /public/legal/versions/:id?locale=` | `@Public()` | A specific historical version |
| `GET /tenant/legal` | `tenant.legal.manage` | All four with draft + published state, every locale |
| `PUT /tenant/legal/:docType/draft` | `tenant.legal.manage` | Create or update the draft; body carries one locale's title + body |
| `POST /tenant/legal/:docType/publish` | `tenant.legal.manage` | Publish; body carries the cosmetic/material choice |
| `DELETE /tenant/legal/:docType/publish` | `tenant.legal.manage` | Withdraw (closes the storefront) |
| `GET /me/legal/pending` | `@AuthenticatedOnly()` | Types awaiting this user's re-acceptance |
| `POST /me/legal/accept` | `@AuthenticatedOnly()` | Record acceptance of a version |
| `GET /me/legal/acceptances` | `@AuthenticatedOnly()` | This user's acceptance history |

Zod schemas and inferred types go in `packages/contracts` as `legal.ts`, following the existing
contract layout. Every response carrying document text also carries `servedLocale`, so the caller can
decide whether to show the fallback notice instead of re-deriving the rule. `POST /me/legal/accept`
takes `versionId` **and** the locale rendered, which is what lands in `accepted_locale`.

The `/public/legal` routes have no tenant context of their own: they resolve the tenant from
`x-forwarded-host` exactly as `PublicTenantController` does
(`apps/api/src/modules/tenancy/infrastructure/http/public-tenant.controller.ts`), then read through
`TenantDbService.forTenant`. Drafts are never reachable from a public route.

## Out of scope

- **`commission_schedule` consent stays where it is** — written by the tenant at partner approval.
  `TONG-QUAN.md:412` wants the partner to re-accept when a commission rule changes; that requires
  versioning commission rules, which is a separate piece of work. Recording it here as the known
  remaining gap.
- **`promo_funding`** is per-promotion, not a tenant document. Unchanged.
- **Machine translation of drafts.** Locales are authored by the tenant or taken from the shipped
  template. Nothing calls a translation API.
- **Locales beyond `localeSchema`.** Adding a third language is adding it to `['vi', 'en']` platform-
  wide; the document tables need no change to follow.
- **Platform-level terms** (BookingOS ↔ tenant owner at signup). Same machinery would serve it, but
  it is a different counterparty and a different gate.
- **Platform moderation of tenant-authored text** (decision 5).

## Verification

No tests, per [ADR 0005](../../decisions/0005-no-tests-policy.md). Verification is the static gate
plus running the app:

```
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build \
  && pnpm --filter=@booking/api check:rls
```

Then, against a reset database:

1. `prisma migrate reset` + dev seed → `bookingstudio.localhost:5173` is live, all four documents
   published, footer links render.
2. Withdraw one document in the dashboard → the storefront returns 423, the dashboard stays usable
   and shows the readiness card, `/legal/dieu-khoan-su-dung` still renders.
3. Republish → storefront live again.
4. Register a new customer without ticking → blocked; with ticking → two acceptance rows.
5. Apply as partner and as affiliate → one acceptance row each, `document_version_id` populated,
   and no `partner_terms` row appears at approval.
6. Publish `partner_terms` as a material change → the partner is redirected to the accept screen on
   next dashboard load and a partner write route returns the guard's error until they accept.
7. `SEED_SCOPE=tenants` on a clean database → four drafts, storefront dark.
8. `/vi/legal/dieu-khoan-su-dung` and `/en/legal/dieu-khoan-su-dung` serve different text; delete the
   English translation and `/en` falls back to Vietnamese **with the notice** and
   `Content-Language: vi`.
9. Clear the tenant's `defaultLocale` translation on one document → storefront goes dark, proving the
   gate keys on the default locale and not merely on a version existing.
10. Register from `/en` while only Vietnamese exists → the acceptance row carries
    `accepted_locale = 'vi'`, not `'en'`.
