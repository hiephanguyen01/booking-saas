# Legal documents & consent (Điều khoản)

A tenant's storefront **refuses to serve traffic** until it has published four legal documents —
customer terms, privacy policy, partner terms, affiliate terms — in its own default language.
Customers, partners and affiliates leave acceptance records naming the **exact version** and the
**language actually rendered**. Built 2026-07-31. Contract:
[`packages/contracts/src/contracts/legal.ts`](../../packages/contracts/src/contracts/legal.ts).
Design decisions: [ADR 0008](../decisions/0008-legal-documents-and-consent.md).

## Data model

Three tenant-scoped tables (all RLS), plus columns on two existing ones. Migrations:
`20260731140000_tenant_legal_documents/` and `20260731150000_legal_readiness_ordering/`.

- **`legal_documents`** — one row per `(tenant_id, doc_type)`. `current_version_id` points at the
  version the storefront serves; `NULL` means never published or withdrawn.
- **`legal_document_versions`** — `version_no`, `is_material_change`, `published_at`,
  `published_by_user_id`. `published_at IS NULL` is the **draft**; a partial unique index
  (`legal_document_versions_draft_key`) allows exactly one draft per document. A draft carries the
  sentinel `version_no = 0`, overwritten on publish.
- **`legal_document_translations`** — `(version_id, locale)` unique, `title`, `body_md`. Text lives
  **below** the version because a version *is* the agreement and `vi`/`en` are two renderings of that
  one agreement (ADR 0008).
- **`agreement_acceptances`** gains `document_version_id` (FK `ON DELETE RESTRICT` — evidence can
  never be deleted out from under itself) and `accepted_locale`, plus a `user_id` FK and index that
  never existed before. `AgreementType` gains `customer_terms`, `privacy_policy`, `affiliate_terms`.
- **`tenants`** gains `legal_ready_at`, `legal_documents_ready` (0-4) and
  `legal_readiness_applied_at` (the CAS guard, see *Readiness* below).

**Every publish creates a new version — cosmetic ones too.** A published row is never rewritten, so
the text someone accepted is always reproducible. `is_material_change` decides *who re-accepts*, not
whether history is kept.

## The hard gate

`ResolveTenantByHostUseCase` gains one conjunct:

```ts
const live = tenant.status === 'active' && evaluation.storefrontLive && tenant.legalReadyAt !== null;
```

Two free consequences, deliberately not re-implemented: `checkout.use-case.ts` and
`create-booking.use-case.ts` already branch on `tenant.live`, so a legally-unready tenant cannot take
a booking or start a checkout.

**No cache invalidation on publish.** `ITenantCache` stores only `host:<hostname>` → tenantId for 60s;
`live` is recomputed on every request, so publishing the fourth document un-darks the storefront on
the very next request.

The storefront gate has **two layers**, and both need the exemption for legal pages:
`features/root/server/request-security.server.ts` throws before any route runs, *and*
`TenantStorefrontAppShell` swaps the whole route tree for `SuspendedNotice`. A `handle.bypassTenantGate`
flag threads through `use-storefront-app-shell-controller.ts`. Fixing only the first leaves legal
pages unreachable on a dark storefront — which is the one thing that must keep working.

**The dashboard is never gated.** Gating it would trap a tenant outside the only screen that can fix
the problem.

## Readiness — computed in `legal`, applied in `tenancy`

`legal` computes `{legalReady, publishedCount}` itself and emits `legal.readiness_changed`; the
`tenancy` handler (`apply-legal-readiness.use-case.ts`) only writes columns and **imports nothing from
`legal`**. That direction is not a style choice: `legal` already imports `tenancy` (guard + host
resolution), so the reverse import closes a cycle the module-cycle guard fails on.

Outbox delivery is at-least-once **and out of order** (a failed row backs off up to 300s while newer
rows drain), so the handler is a guarded compare-and-set against `legal_readiness_applied_at`. Without
it a retried stale snapshot could re-stamp `legal_ready_at` after a withdrawal cleared it — reopening
the gate permanently, since nothing else recomputes the column.

## Backend — `apps/api/src/modules/legal/`

Standard hexagonal module (the 18th context). `domain/{entities,errors,ports,templates}` +
three pure kernels — `legal-readiness.ts`, `locale-resolution.ts`, `legal-document-type.ts` —
`application/use-cases` (one file each), `application/legal.mapper.ts`,
`infrastructure/{repositories,http}`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/public/legal` | `@Public` | Published documents for the host's tenant (footer links) |
| `GET` | `/public/legal/:docType?locale=` | `@Public` | Current published version + `servedLocale`/`fellBack` |
| `GET` | `/public/legal/:docType/versions/:versionNo?locale=` | `@Public` | A specific historical version |
| `GET` | `/tenant/legal` | `tenant.legal.manage` | Authoring view: draft + published state, every locale, history |
| `PUT` | `/tenant/legal/:docType/draft` | `tenant.legal.manage` | Create or replace the draft |
| `POST` | `/tenant/legal/:docType/publish` | `tenant.legal.manage` | Body carries the cosmetic/material choice |
| `DELETE` | `/tenant/legal/:docType/publish` | `tenant.legal.manage` | Withdraw — closes the gate |
| `GET` | `/me/legal/pending` | `@AuthenticatedOnly` | Documents awaiting this caller's re-acceptance |
| `POST` | `/me/legal/accept` | `@AuthenticatedOnly` | Record acceptance |
| `GET` | `/me/legal/acceptances` | `@AuthenticatedOnly` | "Điều khoản tôi đã đồng ý" |

`/public/legal*` resolves the tenant from `x-forwarded-host` (storefront BFF). `/me/legal/*` resolves
it from the **verified** `x-tenant-id` / `x-partner-id` / `x-affiliate-tenant` scope headers the
dashboard sends (`resolve-legal-caller-scope.use-case.ts`) — resolving those from `Host` was a shipped
bug that 404'd every dashboard call and silently disabled the whole re-acceptance flow.

Two outbox consumers registered in `LegalModule.onModuleInit`:
- `tenant.created` → seed the four drafts for a new tenant. `CreateTenantUseCase` already emitted this;
  calling `legal` from `tenancy` directly would have been a cycle.
- `user.registration_consent` → write the customer's registration acceptances (see below).

## Consent capture

| Gate | Types recorded | Where |
| --- | --- | --- |
| Customer registration | `customer_terms`, `privacy_policy` | Required tick; carried on the OTP challenge payload, emitted as an outbox event at `CompleteRegistrationUseCase` |
| Checkout | `customer_terms` | Notice line, no tick; written inside the booking transaction |
| Partner application | `partner_terms` + customer terms + privacy | One tick, three documents; written in `ApplyAsPartnerUseCase`'s existing `forTenant` tx |
| Affiliate application | `affiliate_terms` + customer terms + privacy | Same, in `ApplyAffiliateUseCase`'s `create` branch only (re-apply is idempotent) |

Registration is the one asynchronous case: `PrismaUserRepository.create` runs on the **admin
(BYPASSRLS) pool outside any transaction** by design, and `identity-access` cannot import `legal`
(cycle). So consent travels as an event. The non-atomicity is commented at the call site.

**Fixed defect:** `partner_terms` acceptance used to be written at *tenant approval* time stamped with
`ctx.userId` — the tenant staff member who clicked approve. Read literally, the row claimed a tenant
employee had accepted the partner's terms. `partner`'s private `AGREEMENT_REPOSITORY` was deleted and
`legal` now owns every document-backed acceptance; `promotions`' `promo_funding` recorder and
`notification`'s raw-SQL read stay where they are (folding them in would create cycles).

## Re-acceptance

Pending = the caller's newest accepted `version_no` for a type is below the newest **material**
`version_no`. A cosmetic republish therefore moves nobody.

Enforced at two layers, on purpose. The dashboard's partner/affiliate layout loaders redirect to
`/{partner,affiliate}/legal-update`; and `RequireCurrentAgreementGuard` blocks **write** routes across
13 controllers in 8 modules (partner, affiliate, listing, booking, scheduling, promotions, finance,
reviews). Read routes stay open so a blocked user can still see their own data. A loader redirect
alone is not enforcement — any caller skipping the UI would otherwise write unsigned.

Affiliate routes are `@AuthenticatedOnly()` (membership-gated, not RBAC) so `PermissionsGuard` never
seeds tenant context there; `affiliate/infrastructure/http/guards/resolve-affiliate-tenant-context.guard.ts`
resolves it from the caller's membership first and fails closed with a named 403.

## Frontends

**Storefront** — `routes/legal.tsx` (one splat route serving `/:locale/legal/:docSlug` and its
`/v/:versionNo` form), `features/legal/`. Slugs are Vietnamese and stable
(`LEGAL_DOCUMENT_SLUGS`): `dieu-khoan-su-dung`, `chinh-sach-bao-mat`, `dieu-khoan-doi-tac`,
`dieu-khoan-ctv`. Locale resolution is one rule everywhere — route locale, else the tenant default,
which the gate guarantees exists. On fallback the page renders a `role="status"` notice and
`Content-Language` reports the language **actually served**. `/account/terms` changed meaning: it now
lists what this user accepted, linking to the exact version. The platform landing keeps its static
i18n text — a single-label host resolves to no tenant.

**Dashboard** — a "Pháp lý" tab in `routes/tenant/settings.tsx` with one card per document type: a
locale switch, a Markdown editor with live preview, published history, and a publish dialog that
forces the cosmetic-vs-material choice with its consequence spelled out. Publish is disabled until the
default locale has a draft. `features/tenant/components/overview/legal-readiness-card.tsx` explains a
dark storefront on the overview, fed by two new fields on `/tenant/subscription/status` — **not** by
overloading `storefrontLive`, which is documented as subscription-only and is rendered next to a "Gói
dịch vụ" panel.

**Markdown** — `packages/ui/src/components/markdown/restricted-markdown.tsx`, hand-written, no
dependency, emitting React elements. Supports headings (starting at `<h2>` so it never collides with
the page's own `<h1>`), paragraphs, lists, bold, italic and http(s) links only; anything else renders
as literal text. There is no `dangerouslySetInnerHTML` anywhere, so injection is impossible by
construction rather than by convention — which matters, because `check-storefront-security.mjs` does
**not** check for HTML injection.

## Operational notes

- **`tenant.legal.manage` only exists after a seed run.** Until then every `/tenant/legal` route
  returns 403 for everyone. Run `pnpm --filter=@booking/api seed` as part of deploying this.
- **Seeding a permission does not invalidate the Redis permission cache** — users keep getting 403
  until the cache expires or is flushed.
- Seed behaviour follows the existing scope split: `SEED_SCOPE=tenants` creates **drafts only** (a real
  tenant owner must read and publish, and their storefront stays dark until they do); the dev/staging
  default publishes all four for both demo tenants so `pnpm dev` does not bring up two dark sites.
- The seed **duplicates** the repository's publish logic rather than calling it (Nest DI + outbox are
  unavailable in a `ts-node` script), and it does not repair partial state — a document that exists but
  lost a translation is not restored by re-seeding.

## Notes / possible follow-ups

- **Changing a tenant's `default_locale` does not recompute readiness.** A tenant could switch its
  default language to one its documents lack and stay live. This is a real hole in the gate; it needs a
  new `tenancy` event that `legal` listens for.
- `x-affiliate-tenant` is accepted **unverified** on `/me/legal/*`. Affiliates hold no role assignment
  and the `affiliates` table lives in a module `legal` may not import. Every query underneath is
  narrowed to the caller's own `user_id`, and the only reachable text is what `/public/legal` already
  serves anonymously — but if that is judged too loose, the fix is an affiliate-membership read port in
  `shared/`.
- **One `acceptedLocale` per multi-document submission** cannot represent mixed translation coverage
  within a single gate (e.g. partner terms in English, privacy policy only in Vietnamese). Faithful
  recording needs a contract change to per-version locales.
- Adding a missing locale to an already-published version is implemented (`addTranslation`,
  `LegalDocument.assertTranslationEditable`) and correct, but reachable from no UI.
- `RequireCurrentAgreementGuard` adds one tenant transaction per partner write. Correct, but worth a
  look if partner write latency ever matters.
