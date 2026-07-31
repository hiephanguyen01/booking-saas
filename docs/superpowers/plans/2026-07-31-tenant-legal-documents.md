# Tenant Legal Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tenant's storefront only serves traffic once it has published four legal documents in its default language, the tenant has a place to author them, and every customer, partner and affiliate leaves a real acceptance record pointing at the exact version and language they read.

**Architecture:** A new `legal` bounded context (the 18th) owns document content, translations and every document-backed acceptance row. Readiness crosses into `tenancy` through the outbox as a **boolean in the event payload** — `tenancy` never imports `legal`, which is what keeps `pnpm check:module-cycles` green given that `legal` must import `tenancy` for `RequireActiveSubscriptionGuard` and host resolution. The hard gate is one added conjunct in `ResolveTenantByHostUseCase`.

**Tech Stack:** NestJS 11 (hexagonal, no service classes), Prisma + PostgreSQL 16 with RLS, zod contracts in `@booking/contracts`, React Router 8 SSR for storefront + dashboard, shadcn/Tailwind via `@booking/ui`.

**Spec:** `docs/superpowers/specs/2026-07-31-tenant-legal-documents-design.md`

---

## Global Constraints

Every task inherits these. Violating any of them fails CI.

- **NO TESTS, EVER** (`AGENTS.md` rule 1, ADR 0005). Never create `*.spec.*`, `*.test.*`, e2e files, vitest/jest/playwright config, or a `test` script. `pnpm check:no-tests` enforces it. **This plan therefore replaces the writing-plans skill's default TDD cycle with the repo's verification cycle** — every task ends with typecheck/lint/build (plus `check:rls` and `check:module-cycles` where relevant) and a manual run, never with a test.
- **Backend flow is `controller → use-case → repository-port → repository`. No service classes** in the application layer (ADR 0006).
- **One use-case = one file**, exactly one exported `@Injectable XxxUseCase` with a single public `execute()`.
- **All tenant data flows through `TenantDbService.forTenant(tenantId, tx => …)`** — one interactive transaction per business operation. Repositories receive `tx`, never the raw client. Never nest `forTenant`.
- **Every tenant-scoped table needs `tenant_id uuid NOT NULL` + a hand-written RLS migration** (ADR 0004). `prisma migrate dev` is forbidden.
- **Every protected endpoint declares `@RequirePermissions('scope.resource.action')`, `@Public()` or `@AuthenticatedOnly()`.** The global guard is deny-by-default.
- **Money is `bigint` VND; time is `timestamptz` UTC.** Not relevant to this feature but do not regress it.
- **Frontends never fetch the backend from the browser** — all authenticated data goes through RR `loader`/`action`.
- **No new npm dependencies.** Task 13 writes a restricted Markdown renderer by hand precisely to honour this.
- **Node ≥ 22.22.0, pnpm 10.13.1.** `nvm use` before anything; React Router 8 refuses to run below it.
- **Migration folder is `20260731140000_tenant_legal_documents`.** `20260731120000` (the timestamp the spec proposed) is already taken by `_availability_exception_windows`, and `20260731130000` by `_pricing_rule_scope_unique`.

### Decisions this plan makes that the spec left open

These were discovered by reading the code and are binding for implementers.

| # | Decision | Why |
| --- | --- | --- |
| D1 | Readiness is computed **inside `legal`** and shipped as `{ legalReady, publishedCount }` in the outbox payload. `tenancy`'s handler only writes columns. | `tenancy → legal` + `legal → tenancy` is a cycle; `check-module-cycles` counts every relative import including `import type`. |
| D2 | `tenants` gains **two** columns: `legal_ready_at timestamptz NULL` and `legal_documents_ready smallint NOT NULL DEFAULT 0`. | The gate needs a flag; the spec's card copy *"còn thiếu 2/4 tài liệu"* needs a count, and deriving it in `tenancy` would require reading `legal_documents` (cycle). |
| D3 | A **new field `legalReady` + `legalDocumentsReady`** is added to `subscriptionStatusResponseSchema`. `storefrontLive` is **not** touched. | `storefrontLive` is documented as subscription-only in three places and is rendered by `settings-overview.tsx:83-85` next to a "Gói dịch vụ" panel. Overloading it produces a badge saying "tạm ngưng" with a subscription cause that is false. |
| D4 | `partner`'s `AGREEMENT_REPOSITORY` / `IAgreementRepository` / `PrismaAgreementRepository` / `ListPartnerAgreementsUseCase` are **deleted**; `legal` owns the acceptance port. `promotions`' `PROMO_AGREEMENT_RECORDER` and `notification`'s raw SQL **stay**. | `RecordAgreementData.partnerId` is required and the only read is `listByPartner` — neither can serve a customer or affiliate. `notification → legal` would be a cycle (`legal → identity-access → notification`). |
| D5 | Customer-registration consent is recorded via an **outbox event** `identity-access` emits and `legal` handles. | `identity-access → legal` is a cycle. `CompleteRegistrationUseCase` creates the user on the admin pool with no transaction and no tenant context, so a direct in-tx write is impossible anyway. |
| D6 | The partner and affiliate application forms carry **one consent block covering three documents** (role terms + customer terms + privacy policy) and their use-cases write three rows in the existing `forTenant` tx. | Those flows mint the account through `POST /auth/register`, which has no `tenantId` and therefore cannot record customer terms. One tick, three rows, atomic. |
| D7 | Markdown is rendered by a **hand-written restricted-subset renderer producing React elements**, in `packages/ui`. No `dangerouslySetInnerHTML`, no new dependency. | No markdown or sanitizer library exists anywhere in the repo, and `check-storefront-security.mjs` does **not** check HTML injection — so "sanitized at render" would be an unenforced convention. Element output is safe by construction. |
| D8 | `tenant.legal.manage` is **excluded from the `Manager` role**. | `keysOf('tenant')` grants every tenant permission to Manager by default. Publishing a contract is an owner-level act. |
| D9 | `POST /me/legal/accept` is **not** made idempotent with a unique constraint. Duplicate rows are allowed. | `agreement_acceptances` has no unique constraint today, and the pending rule is `max(version_no)`, which tolerates duplicates. Inventing a partial unique index would be unrequested schema risk. |

---

## File Structure

**New — API (`apps/api/src/modules/legal/`)**

```
domain/
  legal-document-type.ts                     the four types + slug map + required set
  legal-readiness.ts                         pure: (docs) -> { legalReady, publishedCount }
  locale-resolution.ts                       pure: (requested, default, available) -> served locale
  entities/legal-document.entity.ts          publish/withdraw/draft rules, version numbering
  errors/legal-errors.ts                     domain errors
  templates/{customer-terms,privacy-policy,partner-terms,affiliate-terms}.template.ts
  ports/legal-document-repository.port.ts
  ports/legal-document-reader.port.ts
  ports/agreement-acceptance-repository.port.ts
application/
  legal.mapper.ts
  use-cases/get-tenant-legal.use-case.ts
  use-cases/save-legal-draft.use-case.ts
  use-cases/publish-legal-document.use-case.ts
  use-cases/withdraw-legal-document.use-case.ts
  use-cases/get-public-legal-document.use-case.ts
  use-cases/list-public-legal-documents.use-case.ts
  use-cases/seed-tenant-legal-drafts.use-case.ts
  use-cases/record-legal-acceptance.use-case.ts
  use-cases/list-pending-acceptances.use-case.ts
  use-cases/list-my-acceptances.use-case.ts
  use-cases/list-partner-acceptances.use-case.ts
  use-cases/record-registration-consent.use-case.ts   (outbox handler target, D5)
infrastructure/
  http/legal.module.ts
  http/tenant-legal.controller.ts
  http/public-legal.controller.ts
  http/me-legal.controller.ts
  http/dto/legal.dto.ts
  http/guards/require-current-agreement.guard.ts
  repositories/prisma-legal-document.repository.ts
  repositories/prisma-agreement-acceptance.repository.ts
```

**Modified — API:** `prisma/schema.prisma`, one new migration dir, `permission-catalog.ts`, `tenancy/{domain/ports/tenant-repository.port.ts, infrastructure/repositories/prisma-tenant.repository.ts, application/use-cases/resolve-tenant-by-host.use-case.ts, application/use-cases/get-subscription-status.use-case.ts, application/tenancy.mapper.ts, application/use-cases/apply-legal-readiness.use-case.ts (new), infrastructure/http/tenancy.module.ts, application/use-cases/create-tenant.use-case.ts}`, `partner/{apply-as-partner, approve-partner}.use-case.ts` + `partner.entity.ts` + `partner.module.ts` + `partner-application.controller.ts` + `partner-profile.controller.ts` (− 2 deleted files, − 1 deleted use-case, − `agreement-versions.ts` pruned), `affiliate/{apply-affiliate.use-case.ts, affiliate.controller.ts, affiliate.module.ts}`, `booking/{create-booking.use-case.ts, public-booking.controller.ts, booking.module.ts}`, `identity-access/{complete-registration.use-case.ts, auth-challenge-store.port.ts, start-registration.use-case.ts, public-auth.controller.ts}`, `app.module.ts`, `prisma/seed/tenants/{booking-studio,booking-stad}.ts`, `prisma/seed/demo/studio-demo.ts`.

**New — packages:** `packages/contracts/src/contracts/legal.ts`, `packages/ui/components/markdown/restricted-markdown.tsx`.

**New — dashboard:** `features/tenant/components/settings/legal-documents-card.tsx`, `features/tenant/components/settings/legal-publish-dialog.tsx`, `features/tenant/components/overview/legal-readiness-card.tsx`, `features/legal/server/legal.server.ts`, `routes/partner/legal-update.tsx`, `routes/affiliate/legal-update.tsx`.

**New — storefront:** `routes/legal.tsx`, `features/legal/components/legal-document-page.tsx`, `features/legal/server/legal.server.ts`, `features/account/components/legal/my-acceptances-page.tsx`.

---

## Task 1: Schema, migration, RLS

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum block `:69-75`, `model Tenant` `:651`, `model AgreementAcceptance` `:719-735`, `model User` relation list)
- Create: `apps/api/prisma/migrations/20260731140000_tenant_legal_documents/migration.sql`

**Interfaces:**
- Produces: Prisma models `LegalDocument`, `LegalDocumentVersion`, `LegalDocumentTranslation`; enum `LegalDocumentType`; `Tenant.legalReadyAt`, `Tenant.legalDocumentsReady`; `AgreementAcceptance.documentVersionId`, `AgreementAcceptance.acceptedLocale`; `AgreementType` values `customer_terms`, `privacy_policy`, `affiliate_terms`.

- [ ] **Step 1: Add the enum next to the existing `AgreementType`**

In `apps/api/prisma/schema.prisma`, replace the `AgreementType` enum at `:69-75` and add the new one directly after it:

```prisma
enum AgreementType {
  partner_terms
  commission_schedule
  promo_funding
  customer_terms
  privacy_policy
  affiliate_terms

  @@map("agreement_type")
}

/// The four tenant-authored documents that gate a storefront. A subset of
/// AgreementType by name — the other two values are not documents.
enum LegalDocumentType {
  customer_terms
  privacy_policy
  partner_terms
  affiliate_terms

  @@map("legal_document_type")
}
```

- [ ] **Step 2: Add the three models**

Append after `model AgreementAcceptance`:

```prisma
/// One legal document per type per tenant. `currentVersionId` points at the
/// published version the storefront serves; null means never published.
model LegalDocument {
  id               String            @id @default(uuid(7)) @db.Uuid
  tenantId         String            @map("tenant_id") @db.Uuid
  docType          LegalDocumentType @map("doc_type")
  currentVersionId String?           @map("current_version_id") @db.Uuid
  createdAt        DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant         Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  currentVersion LegalDocumentVersion?  @relation("LegalDocumentCurrent", fields: [currentVersionId], references: [id], onDelete: SetNull)
  versions       LegalDocumentVersion[] @relation("LegalDocumentVersions")

  @@unique([tenantId, docType])
  @@map("legal_documents")
}

/// An immutable published version, or the single draft (published_at null).
/// Every publish creates a new row; `isMaterialChange` decides who re-accepts.
model LegalDocumentVersion {
  id                String    @id @default(uuid(7)) @db.Uuid
  tenantId          String    @map("tenant_id") @db.Uuid
  documentId        String    @map("document_id") @db.Uuid
  versionNo         Int       @map("version_no")
  isMaterialChange  Boolean   @default(false) @map("is_material_change")
  publishedAt       DateTime? @map("published_at") @db.Timestamptz(6)
  publishedByUserId String?   @map("published_by_user_id") @db.Uuid
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  document        LegalDocument              @relation("LegalDocumentVersions", fields: [documentId], references: [id], onDelete: Cascade)
  publishedBy     User?                      @relation(fields: [publishedByUserId], references: [id], onDelete: SetNull)
  translations    LegalDocumentTranslation[]
  currentOf       LegalDocument[]            @relation("LegalDocumentCurrent")
  acceptances     AgreementAcceptance[]

  @@unique([documentId, versionNo])
  @@index([tenantId])
  @@map("legal_document_versions")
}

/// One rendering of a version. A version is the agreement; vi and en of v3 are
/// one contract in two languages, which is why locale lives here and not above.
model LegalDocumentTranslation {
  id        String   @id @default(uuid(7)) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  versionId String   @map("version_id") @db.Uuid
  locale    String
  title     String
  bodyMd    String   @map("body_md")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  version LegalDocumentVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)

  @@unique([versionId, locale])
  @@index([tenantId])
  @@map("legal_document_translations")
}
```

- [ ] **Step 3: Extend `Tenant`, `AgreementAcceptance` and `User`**

`model Tenant` — add after `defaultCancellationPolicyId` (`:664`):

```prisma
  /// Stamped by the legal-readiness outbox handler when all four required
  /// documents are published in the tenant's defaultLocale; cleared otherwise.
  /// The storefront hard gate keys on this being non-null.
  legalReadyAt         DateTime? @map("legal_ready_at") @db.Timestamptz(6)
  /// How many of the four required documents are published in defaultLocale (0-4).
  legalDocumentsReady  Int       @default(0) @map("legal_documents_ready") @db.SmallInt
```

and add to its relation list: `legalDocuments LegalDocument[]`.

`model AgreementAcceptance` — add the two columns, the `user` relation, the version relation and two indexes:

```prisma
  /// The exact tenant-authored version accepted. Null for commission_schedule / promo_funding.
  documentVersionId String?       @map("document_version_id") @db.Uuid
  /// The language actually rendered on screen when the person clicked, fallback included.
  acceptedLocale    String?       @map("accepted_locale")
```

```prisma
  user            User?                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  documentVersion LegalDocumentVersion? @relation(fields: [documentVersionId], references: [id], onDelete: Restrict)

  @@index([tenantId, userId, agreementType])
  @@index([documentVersionId])
```

`model User` — add two back-relations to its relation list (it currently ends at `listingRevisionsReviewed`):

```prisma
  agreementAcceptances     AgreementAcceptance[]
  legalVersionsPublished   LegalDocumentVersion[]
```

- [ ] **Step 4: Write the migration**

Create `apps/api/prisma/migrations/20260731140000_tenant_legal_documents/migration.sql`.

Three traps, all verified against `apps/api/scripts/check-rls.ts:346-363`, that make CI fail if you deviate:
1. The policy name must be a **bare word** — `CREATE POLICY "tenant_isolation"` does not match `\w+` and fails.
2. Something whitespace-or-`(` must follow the table name — `CREATE POLICY tenant_isolation ON "legal_documents";` fails. Put `USING` on the next line.
3. Emit both `ENABLE` and `FORCE`; the script only checks `FORCE`, but only `ENABLE` makes the policy take effect.

```sql
-- A tenant may not serve a storefront until it has published customer terms, a
-- privacy policy, partner terms and affiliate terms in its default language
-- (§ hard gate). Documents are versioned and immutable once published; a version
-- is the agreement and its translations are renderings of that one agreement.

CREATE TYPE "legal_document_type" AS ENUM (
  'customer_terms',
  'privacy_policy',
  'partner_terms',
  'affiliate_terms'
);

-- New value can be added but not used in the same transaction; nothing below
-- inserts rows using them, so this is safe at the top of the file.
ALTER TYPE "agreement_type" ADD VALUE IF NOT EXISTS 'customer_terms';
ALTER TYPE "agreement_type" ADD VALUE IF NOT EXISTS 'privacy_policy';
ALTER TYPE "agreement_type" ADD VALUE IF NOT EXISTS 'affiliate_terms';

CREATE TABLE "legal_documents" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "doc_type" "legal_document_type" NOT NULL,
  "current_version_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_documents_tenant_id_doc_type_key" UNIQUE ("tenant_id", "doc_type"),
  CONSTRAINT "legal_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "legal_document_versions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "version_no" INTEGER NOT NULL,
  "is_material_change" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMPTZ(6),
  "published_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_document_versions_document_id_version_no_key" UNIQUE ("document_id", "version_no"),
  CONSTRAINT "legal_document_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "legal_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "legal_document_versions_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "legal_document_translations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "locale" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body_md" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "legal_document_translations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_document_translations_version_id_locale_key" UNIQUE ("version_id", "locale"),
  CONSTRAINT "legal_document_translations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "legal_document_translations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "legal_document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- current_version_id is added after legal_document_versions exists (circular FK).
ALTER TABLE "legal_documents"
  ADD CONSTRAINT "legal_documents_current_version_id_fkey"
  FOREIGN KEY ("current_version_id") REFERENCES "legal_document_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "legal_documents_tenant_id_idx" ON "legal_documents"("tenant_id");
CREATE INDEX "legal_document_versions_tenant_id_idx" ON "legal_document_versions"("tenant_id");
CREATE INDEX "legal_document_translations_tenant_id_idx" ON "legal_document_translations"("tenant_id");

-- At most one draft per document: saving again overwrites it, so "what is
-- waiting to be published" is never ambiguous.
CREATE UNIQUE INDEX "legal_document_versions_draft_key"
  ON "legal_document_versions"("document_id")
  WHERE "published_at" IS NULL;

ALTER TABLE "legal_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "legal_documents"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE "legal_document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_document_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "legal_document_versions"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE "legal_document_translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_document_translations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "legal_document_translations"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON "legal_documents", "legal_document_versions", "legal_document_translations"
  TO app_user, app_admin;

-- ── The gate flag lives on tenants (no tenant_id column → no RLS work here) ──
ALTER TABLE "tenants"
  ADD COLUMN "legal_ready_at" TIMESTAMPTZ(6),
  ADD COLUMN "legal_documents_ready" SMALLINT NOT NULL DEFAULT 0;

-- ── agreement_acceptances becomes document-aware ─────────────────────────────
ALTER TABLE "agreement_acceptances"
  ADD COLUMN "document_version_id" UUID,
  ADD COLUMN "accepted_locale" TEXT;

-- An accepted version can never be deleted out from under its own evidence.
ALTER TABLE "agreement_acceptances"
  ADD CONSTRAINT "agreement_acceptances_document_version_id_fkey"
  FOREIGN KEY ("document_version_id") REFERENCES "legal_document_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- user_id had neither an FK nor an index; every /me/legal/* query is user-scoped.
ALTER TABLE "agreement_acceptances"
  ADD CONSTRAINT "agreement_acceptances_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agreement_acceptances_tenant_id_user_id_agreement_type_idx"
  ON "agreement_acceptances"("tenant_id", "user_id", "agreement_type");
CREATE INDEX "agreement_acceptances_document_version_id_idx"
  ON "agreement_acceptances"("document_version_id");
```

`agreement_acceptances` needs no RLS block — it is already covered by the table array in `20260709000001_rls_domain_and_constraints/migration.sql:27`.

- [ ] **Step 5: Apply and verify**

```bash
nvm use
docker compose up -d
pnpm --filter=@booking/api exec prisma migrate reset --force
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
```

Expected: `check-rls: OK — N tenant-scoped tables all have FORCE RLS + policy.` with N three higher than before. If it reports `legal_document_translations — no CREATE POLICY in any migration`, you hit trap 1 or 2 above.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260731140000_tenant_legal_documents
git commit -m "feat(api): legal document tables, gate columns, document-aware acceptances"
```

---

## Task 2: Contracts

**Files:**
- Create: `packages/contracts/src/contracts/legal.ts`
- Modify: `packages/contracts/src/index.ts` (add the export), `packages/contracts/src/contracts/tenancy.ts` (`subscriptionStatusResponseSchema` `:391-407`), `packages/contracts/src/contracts/partner.ts` (`partnerApplyInputSchema` `:78-89`, `partnerOnboardingProfileSchema` `:235-279`, `PartnerAgreementResponse` `:365-371`), `packages/contracts/src/contracts/affiliate.ts` (`applyAffiliateInputSchema` `:63-69`, `affiliateRegistrationSchema` `:86-97`), `packages/contracts/src/contracts/auth.ts` (`registrationStartInputSchema` `:16-22`), `packages/contracts/src/contracts/booking.ts` (`createBookingInputSchema`)

**Interfaces:**
- Consumes: Task 1's enum names.
- Produces: `legalDocumentTypeSchema`, `LegalDocumentType`, `legalDocumentResponseSchema`/`LegalDocumentResponse`, `tenantLegalDocumentSchema`/`TenantLegalDocument`, `saveLegalDraftInputSchema`/`SaveLegalDraftInput`, `publishLegalDocumentInputSchema`/`PublishLegalDocumentInput`, `pendingAcceptanceSchema`/`PendingAcceptance`, `acceptLegalInputSchema`/`AcceptLegalInput`, `acceptanceRecordSchema`/`AcceptanceRecord`, `legalConsentInputSchema`/`LegalConsentInput`.

- [ ] **Step 1: Write `packages/contracts/src/contracts/legal.ts`**

```ts
import { z } from 'zod';
import { localeSchema, uuidSchema } from './common';

export const legalDocumentTypeSchema = z.enum([
  'customer_terms',
  'privacy_policy',
  'partner_terms',
  'affiliate_terms',
]);
export type LegalDocumentType = z.infer<typeof legalDocumentTypeSchema>;

/** Storefront URL segment per document type — stable, Vietnamese, never translated. */
export const LEGAL_DOCUMENT_SLUGS = {
  customer_terms: 'dieu-khoan-su-dung',
  privacy_policy: 'chinh-sach-bao-mat',
  partner_terms: 'dieu-khoan-doi-tac',
  affiliate_terms: 'dieu-khoan-ctv',
} as const satisfies Record<LegalDocumentType, string>;

export const LEGAL_DOCUMENT_TYPE_BY_SLUG: Record<string, LegalDocumentType> = Object.fromEntries(
  Object.entries(LEGAL_DOCUMENT_SLUGS).map(([type, slug]) => [slug, type as LegalDocumentType]),
);

/** Every required document; the storefront is dark until all four are published. */
export const REQUIRED_LEGAL_DOCUMENT_TYPES = [
  'customer_terms',
  'privacy_policy',
  'partner_terms',
  'affiliate_terms',
] as const;

/** One rendering of one version. */
export const legalTranslationSchema = z.object({
  locale: localeSchema,
  title: z.string().min(1).max(300),
  bodyMd: z.string().min(1).max(200_000),
});
export type LegalTranslation = z.infer<typeof legalTranslationSchema>;

/**
 * A published document as the storefront serves it. `servedLocale` is the
 * language actually rendered — it differs from the requested locale when the
 * tenant has not translated this document, and the page must say so.
 */
export const legalDocumentResponseSchema = z.object({
  docType: legalDocumentTypeSchema,
  slug: z.string(),
  versionId: uuidSchema,
  versionNo: z.number().int().positive(),
  publishedAt: z.string(),
  requestedLocale: localeSchema,
  servedLocale: localeSchema,
  /** true when servedLocale !== requestedLocale — render the fallback notice. */
  fellBack: z.boolean(),
  title: z.string(),
  bodyMd: z.string(),
});
export type LegalDocumentResponse = z.infer<typeof legalDocumentResponseSchema>;

export const legalDocumentSummarySchema = legalDocumentResponseSchema.omit({ bodyMd: true });
export type LegalDocumentSummary = z.infer<typeof legalDocumentSummarySchema>;

/** One published version in the tenant's history list. */
export const legalVersionSummarySchema = z.object({
  versionId: uuidSchema,
  versionNo: z.number().int().positive(),
  isMaterialChange: z.boolean(),
  publishedAt: z.string(),
  locales: z.array(localeSchema),
});
export type LegalVersionSummary = z.infer<typeof legalVersionSummarySchema>;

/** The authoring view: one card in the dashboard's Pháp lý tab. */
export const tenantLegalDocumentSchema = z.object({
  docType: legalDocumentTypeSchema,
  currentVersionNo: z.number().int().positive().nullable(),
  currentTranslations: z.array(legalTranslationSchema),
  draftTranslations: z.array(legalTranslationSchema),
  hasDraft: z.boolean(),
  /** True when the current published version covers the tenant's defaultLocale. */
  readyInDefaultLocale: z.boolean(),
  history: z.array(legalVersionSummarySchema),
});
export type TenantLegalDocument = z.infer<typeof tenantLegalDocumentSchema>;

export const tenantLegalOverviewSchema = z.object({
  defaultLocale: localeSchema,
  legalReady: z.boolean(),
  publishedCount: z.number().int().min(0).max(4),
  documents: z.array(tenantLegalDocumentSchema),
});
export type TenantLegalOverview = z.infer<typeof tenantLegalOverviewSchema>;

export const saveLegalDraftInputSchema = z.object({
  translations: z.array(legalTranslationSchema).min(1).max(2),
});
export type SaveLegalDraftInput = z.infer<typeof saveLegalDraftInputSchema>;

/**
 * `material: true` means the terms changed and every partner/affiliate must
 * accept again; `false` is a typo fix that still creates a version but moves
 * nobody's acceptance bar.
 */
export const publishLegalDocumentInputSchema = z.object({
  material: z.boolean(),
});
export type PublishLegalDocumentInput = z.infer<typeof publishLegalDocumentInputSchema>;

export const pendingAcceptanceSchema = z.object({
  docType: legalDocumentTypeSchema,
  slug: z.string(),
  versionId: uuidSchema,
  versionNo: z.number().int().positive(),
  title: z.string(),
  bodyMd: z.string(),
  servedLocale: localeSchema,
});
export type PendingAcceptance = z.infer<typeof pendingAcceptanceSchema>;

export const acceptLegalInputSchema = z.object({
  versionIds: z.array(uuidSchema).min(1).max(4),
  acceptedLocale: localeSchema,
});
export type AcceptLegalInput = z.infer<typeof acceptLegalInputSchema>;

export const acceptanceRecordSchema = z.object({
  agreementType: z.enum([
    'partner_terms',
    'commission_schedule',
    'promo_funding',
    'customer_terms',
    'privacy_policy',
    'affiliate_terms',
  ]),
  version: z.string(),
  documentVersionId: uuidSchema.nullable(),
  acceptedLocale: localeSchema.nullable(),
  acceptedAt: z.string(),
});
export type AcceptanceRecord = z.infer<typeof acceptanceRecordSchema>;

/**
 * The consent block every application form submits: which exact versions were
 * on screen and in which language. The server rejects a versionId that is not
 * the document's current version, so a stale tab cannot produce a signature for
 * text the person never saw.
 */
export const legalConsentInputSchema = z.object({
  acceptedVersionIds: z.array(uuidSchema).min(1).max(4),
  acceptedLocale: localeSchema,
});
export type LegalConsentInput = z.infer<typeof legalConsentInputSchema>;
```

- [ ] **Step 2: Export it**

Add `export * from './contracts/legal';` to `packages/contracts/src/index.ts` beside the other contract exports.

- [ ] **Step 3: Extend the touched schemas**

`tenancy.ts` — inside `subscriptionStatusResponseSchema` (D3; `storefrontLive` untouched):

```ts
  /** false → the storefront is dark because required legal documents are unpublished. */
  legalReady: z.boolean(),
  /** How many of the four required documents are published in the tenant's default language. */
  legalDocumentsReady: z.number().int().min(0).max(4),
```

`partner.ts`:
- `partnerApplyInputSchema` gains `legalConsent: legalConsentInputSchema` (import from `./legal`).
- `partnerOnboardingProfileSchema` gains `acceptedVersionIds: z.array(uuidSchema).min(1).max(4)` and `acceptedLocale: localeSchema` next to the existing `acceptedTerms` at `:271` — keep `acceptedTerms`, it is the checkbox the user ticks.
- `PartnerAgreementResponse` (`:365-371`) — widen its `agreementType` enum to all six values, or re-export `acceptanceRecordSchema`. Prefer replacing its body with `export const partnerAgreementResponseSchema = acceptanceRecordSchema;` and keeping the old exported name so `apps/dashboard/app/routes/partner/profile.tsx:45` keeps compiling.

`affiliate.ts`:
- `applyAffiliateInputSchema` gains `legalConsent: legalConsentInputSchema`.
- `affiliateRegistrationSchema` gains `acceptedTerms: z.boolean().refine(Boolean, 'Vui lòng đồng ý với điều khoản')`, `acceptedVersionIds`, `acceptedLocale`.

`auth.ts` — `registrationStartInputSchema` gains:

```ts
  acceptedVersionIds: z.array(uuidSchema).min(1).max(4).optional(),
  acceptedLocale: localeSchema.optional(),
```

Optional because the partner-onboarding flow calls `/auth/registration/start` without a tenant and therefore without documents (verified: `partner-registration-start-route.server.ts` posts `{ email, fullName, locale }` only).

`booking.ts` — `createBookingInputSchema` gains `acceptedVersionIds: z.array(uuidSchema).max(1).optional()` and `acceptedLocale: localeSchema.optional()`.

- [ ] **Step 4: Verify**

```bash
pnpm --filter=@booking/contracts build && pnpm --filter=@booking/contracts typecheck
```

Expected: clean. Downstream apps will not typecheck yet — that is expected until Task 7 and Tasks 14-19.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): legal document + consent schemas"
```

---

## Task 3: Legal domain layer

**Files:**
- Create: `apps/api/src/modules/legal/domain/legal-document-type.ts`, `domain/legal-readiness.ts`, `domain/locale-resolution.ts`, `domain/entities/legal-document.entity.ts`, `domain/errors/legal-errors.ts`

**Interfaces:**
- Produces: `REQUIRED_DOC_TYPES`, `computeLegalReadiness(docs, defaultLocale): { legalReady: boolean; publishedCount: number }`, `resolveLegalLocale(requested, defaultLocale, available): { locale: Locale; fellBack: boolean }`, `LegalDocument.nextVersionNo(...)`, `LegalDocument.assertPublishable(...)`, `LegalDocument.assertTranslationEditable(...)`, error classes `LegalDocumentNotFound`, `LegalDraftMissing`, `LegalDefaultLocaleRequired`, `LegalVersionStale`, `LegalTranslationImmutable`.

- [ ] **Step 1: `domain/legal-document-type.ts`**

```ts
import { REQUIRED_LEGAL_DOCUMENT_TYPES, type LegalDocumentType } from '@booking/contracts';

export const REQUIRED_DOC_TYPES: readonly LegalDocumentType[] = REQUIRED_LEGAL_DOCUMENT_TYPES;

/** The agreement_type value recorded when this document is accepted — same names. */
export function agreementTypeFor(docType: LegalDocumentType): LegalDocumentType {
  return docType;
}
```

- [ ] **Step 2: `domain/legal-readiness.ts` — the pure kernel D1 depends on**

```ts
import type { LegalDocumentType } from '@booking/contracts';
import { REQUIRED_DOC_TYPES } from './legal-document-type';

export interface ReadinessInput {
  docType: LegalDocumentType;
  /** Locales of the CURRENT PUBLISHED version. Empty when never published. */
  publishedLocales: readonly string[];
}

export interface LegalReadiness {
  legalReady: boolean;
  publishedCount: number;
}

/**
 * A document counts only when it is published AND carries the tenant's default
 * language. Other locales are optional — requiring a complete vi+en set would
 * hold a Vietnamese studio's storefront hostage to an English translation it has
 * no customers for.
 */
export function computeLegalReadiness(
  docs: readonly ReadinessInput[],
  defaultLocale: string,
): LegalReadiness {
  const publishedCount = REQUIRED_DOC_TYPES.filter((type) =>
    docs.some((d) => d.docType === type && d.publishedLocales.includes(defaultLocale)),
  ).length;
  return { legalReady: publishedCount === REQUIRED_DOC_TYPES.length, publishedCount };
}
```

- [ ] **Step 3: `domain/locale-resolution.ts`**

```ts
import type { Locale } from '@booking/contracts';

export interface ResolvedLegalLocale {
  locale: Locale;
  fellBack: boolean;
}

/**
 * One rule, used by the public page AND every consent gate: the requested
 * locale, else the tenant default (which the gate guarantees exists). A contract
 * silently appearing in the wrong language is how someone ends up agreeing to
 * something they could not read, so the caller must surface `fellBack`.
 */
export function resolveLegalLocale(
  requested: Locale,
  defaultLocale: Locale,
  available: readonly string[],
): ResolvedLegalLocale {
  if (available.includes(requested)) return { locale: requested, fellBack: false };
  if (available.includes(defaultLocale)) return { locale: defaultLocale, fellBack: true };
  const first = available[0];
  if (!first) throw new Error('resolveLegalLocale: version has no translations');
  return { locale: first as Locale, fellBack: first !== requested };
}
```

- [ ] **Step 4: `domain/errors/legal-errors.ts`**

Follow the shape of `apps/api/src/modules/content-reports/domain/errors/content-report-errors.ts` (read it first for the exact base class and code convention). Define: `LegalDocumentNotFound` (404 `LEGAL_DOCUMENT_NOT_FOUND`), `LegalDraftMissing` (409 `LEGAL_DRAFT_MISSING`), `LegalDefaultLocaleRequired` (422 `LEGAL_DEFAULT_LOCALE_REQUIRED`), `LegalVersionStale` (409 `LEGAL_VERSION_STALE`), `LegalTranslationImmutable` (409 `LEGAL_TRANSLATION_IMMUTABLE`), `LegalConsentRequired` (422 `LEGAL_CONSENT_REQUIRED`), `LegalAgreementOutdated` (403 `LEGAL_AGREEMENT_OUTDATED`).

- [ ] **Step 5: `domain/entities/legal-document.entity.ts`**

Pure rules, no I/O:

```ts
import type { Locale } from '@booking/contracts';
import { LegalDefaultLocaleRequired, LegalTranslationImmutable } from '../errors/legal-errors';

export interface VersionSnapshot {
  versionNo: number;
  publishedAt: Date | null;
  isMaterialChange: boolean;
  locales: readonly string[];
}

export class LegalDocument {
  /** Every publish creates a new row — cosmetic or material alike. */
  static nextVersionNo(versions: readonly VersionSnapshot[]): number {
    return versions.reduce((max, v) => Math.max(max, v.versionNo), 0) + 1;
  }

  /** The gate keys on the default locale, so a draft without it cannot publish. */
  static assertPublishable(draftLocales: readonly string[], defaultLocale: Locale): void {
    if (!draftLocales.includes(defaultLocale)) throw new LegalDefaultLocaleRequired();
  }

  /**
   * Adding a locale a published version never had is allowed — nobody has read
   * it. Editing one that exists is not: someone may have accepted against that
   * exact text, and the whole point of storing an acceptance is being able to
   * reproduce what was on screen.
   */
  static assertTranslationEditable(
    publishedAt: Date | null,
    existingLocales: readonly string[],
    locale: Locale,
  ): void {
    if (publishedAt && existingLocales.includes(locale)) throw new LegalTranslationImmutable();
  }

  /** Re-acceptance bar: the newest MATERIAL version, not the newest version. */
  static materialWatermark(versions: readonly VersionSnapshot[]): number {
    return versions
      .filter((v) => v.publishedAt !== null && v.isMaterialChange)
      .reduce((max, v) => Math.max(max, v.versionNo), 0);
  }
}
```

- [ ] **Step 6: Verify + commit**

```bash
pnpm --filter=@booking/api typecheck
git add apps/api/src/modules/legal/domain
git commit -m "feat(api): legal domain kernel — readiness, locale resolution, version rules"
```

---

## Task 4: Legal ports, repositories, templates

**Files:**
- Create: `domain/ports/legal-document-repository.port.ts`, `domain/ports/agreement-acceptance-repository.port.ts`, `domain/templates/*.template.ts`, `infrastructure/repositories/prisma-legal-document.repository.ts`, `infrastructure/repositories/prisma-agreement-acceptance.repository.ts`

**Interfaces:**
- Produces: tokens `LEGAL_DOCUMENT_REPOSITORY`, `AGREEMENT_ACCEPTANCE_REPOSITORY`; interfaces `ILegalDocumentRepository`, `IAgreementAcceptanceRepository`; `LEGAL_TEMPLATES: Record<LegalDocumentType, Record<Locale, { title: string; bodyMd: string }>>`.

- [ ] **Step 1: `domain/ports/legal-document-repository.port.ts`**

```ts
import type { LegalDocumentType, Locale } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const LEGAL_DOCUMENT_REPOSITORY = Symbol('LEGAL_DOCUMENT_REPOSITORY');

export interface TranslationRow {
  locale: string;
  title: string;
  bodyMd: string;
}

export interface VersionRow {
  id: string;
  versionNo: number;
  isMaterialChange: boolean;
  publishedAt: Date | null;
  translations: TranslationRow[];
}

export interface DocumentRow {
  id: string;
  docType: LegalDocumentType;
  currentVersionId: string | null;
  versions: VersionRow[];
}

export interface UpsertDraftData {
  tenantId: string;
  docType: LegalDocumentType;
  translations: readonly TranslationRow[];
}

export interface PublishData {
  tenantId: string;
  documentId: string;
  draftVersionId: string;
  versionNo: number;
  isMaterialChange: boolean;
  publishedByUserId: string | null;
}

export interface ILegalDocumentRepository {
  /** Every document of the tenant with all versions + translations. */
  listAll(tx: PrismaTx, tenantId: string): Promise<DocumentRow[]>;
  findByType(tx: PrismaTx, tenantId: string, docType: LegalDocumentType): Promise<DocumentRow | null>;
  findVersionById(tx: PrismaTx, versionId: string): Promise<(VersionRow & { docType: LegalDocumentType }) | null>;
  /** Creates the document row if missing; replaces the single draft. */
  upsertDraft(tx: PrismaTx, data: UpsertDraftData): Promise<string>;
  /** Stamps published_at and repoints current_version_id. */
  publish(tx: PrismaTx, data: PublishData): Promise<void>;
  /** Clears current_version_id — the document stops counting for readiness. */
  withdraw(tx: PrismaTx, tenantId: string, documentId: string): Promise<void>;
  /** Adds a locale a published version never had (never edits an existing one). */
  addTranslation(tx: PrismaTx, tenantId: string, versionId: string, row: TranslationRow): Promise<void>;
  /** Used by create-tenant + seed: the four documents as drafts from templates. */
  seedDrafts(tx: PrismaTx, tenantId: string, locales: readonly Locale[]): Promise<void>;
}
```

- [ ] **Step 2: `domain/ports/agreement-acceptance-repository.port.ts`**

Copy the port verbatim from the recon analysis — it is reproduced here in full so no implementer has to hunt for it:

```ts
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { LegalDocumentType } from '@booking/contracts';

export const AGREEMENT_ACCEPTANCE_REPOSITORY = Symbol('AGREEMENT_ACCEPTANCE_REPOSITORY');

export type AgreementTypeKey =
  | 'partner_terms'
  | 'commission_schedule'
  | 'promo_funding'
  | 'customer_terms'
  | 'privacy_policy'
  | 'affiliate_terms';

export interface RecordAcceptanceData {
  tenantId: string;
  /** The person who clicked. Required for every document-backed acceptance. */
  userId: string;
  /** Only when bound to a partner org (partner_terms, commission_schedule, promo_funding). */
  partnerId?: string | null;
  agreementType: AgreementTypeKey;
  /** Null for the two non-document types. */
  documentVersionId?: string | null;
  /** The locale actually rendered, fallback included. */
  acceptedLocale?: string | null;
  /** version_no as text for documents; the promotion uuid for promo_funding. */
  version: string;
  ip?: string | null;
}

export interface AcceptanceRow {
  agreementType: AgreementTypeKey;
  version: string;
  documentVersionId: string | null;
  acceptedLocale: string | null;
  acceptedAt: Date;
}

export interface PendingRow {
  docType: LegalDocumentType;
  documentId: string;
  versionId: string;
  versionNo: number;
}

/**
 * Legal-owned seam for every proof-of-acceptance row. `partnerId` is optional
 * here — a customer or affiliate acceptance has no partner — which is exactly
 * what partner's deleted AGREEMENT_REPOSITORY could not express.
 */
export interface IAgreementAcceptanceRepository {
  record(tx: PrismaTx, data: RecordAcceptanceData): Promise<void>;
  pendingTypes(
    tx: PrismaTx,
    userId: string,
    types: readonly LegalDocumentType[],
    partnerId?: string | null,
  ): Promise<PendingRow[]>;
  listByUser(tx: PrismaTx, userId: string): Promise<AcceptanceRow[]>;
  listByPartner(tx: PrismaTx, partnerId: string): Promise<AcceptanceRow[]>;
}
```

- [ ] **Step 3: `infrastructure/repositories/prisma-agreement-acceptance.repository.ts`**

`record`, `listByUser`, `listByPartner` are plain Prisma. `pendingTypes` is raw SQL because the rule is max-vs-max across a join, which Prisma's aggregates cannot express in one round trip (verified: there is no `_max` usage anywhere in `apps/api/src`). Raw SQL in a **repository adapter** is sanctioned — `apps/api/CLAUDE.md` forbids it only in application code, and five module repositories already do it.

```ts
  async pendingTypes(
    tx: PrismaTx,
    userId: string,
    types: readonly LegalDocumentType[],
    partnerId?: string | null,
  ): Promise<PendingRow[]> {
    if (types.length === 0) return [];
    const partnerFilter = partnerId ? Prisma.sql`AND a.partner_id = ${partnerId}::uuid` : Prisma.empty;
    const rows = await tx.$queryRaw<
      Array<{ doc_type: LegalDocumentType; document_id: string; version_id: string; version_no: number }>
    >(Prisma.sql`
      WITH accepted AS (
        SELECT d.doc_type, max(v.version_no) AS accepted_no
        FROM agreement_acceptances a
        JOIN legal_document_versions v ON v.id = a.document_version_id
        JOIN legal_documents d ON d.id = v.document_id
        WHERE a.user_id = ${userId}::uuid ${partnerFilter}
        GROUP BY d.doc_type
      ),
      material AS (
        SELECT DISTINCT ON (d.doc_type)
               d.doc_type, d.id AS document_id, v.id AS version_id, v.version_no
        FROM legal_document_versions v
        JOIN legal_documents d ON d.id = v.document_id
        WHERE v.is_material_change = true AND v.published_at IS NOT NULL
        ORDER BY d.doc_type, v.version_no DESC
      )
      SELECT m.doc_type::text AS doc_type, m.document_id, m.version_id, m.version_no
      FROM material m
      LEFT JOIN accepted a ON a.doc_type = m.doc_type
      WHERE m.doc_type = ANY(ARRAY[${Prisma.join(types)}]::legal_document_type[])
        AND (a.accepted_no IS NULL OR a.accepted_no < m.version_no)
      ORDER BY m.doc_type`);
    return rows.map((r) => ({
      docType: r.doc_type,
      documentId: r.document_id,
      versionId: r.version_id,
      versionNo: r.version_no,
    }));
  }
```

**Do not add a `tenant_id = …` predicate** and **do not touch `this.prisma.app`/`.admin`** — `forTenant` already set the GUC on this `tx`, and the RLS policies on all three tables apply to `$queryRaw` on that same transaction.

- [ ] **Step 4: `infrastructure/repositories/prisma-legal-document.repository.ts`**

Straightforward Prisma against the three models. Two rules the implementation must honour:
- `upsertDraft` deletes the existing draft (`publishedAt: null`) for that document before inserting, so the partial unique index never trips.
- `publish` runs `document.update({ data: { currentVersionId } })` and `version.update({ data: { publishedAt, publishedByUserId, isMaterialChange } })` — it never rewrites `bodyMd` of any row.

- [ ] **Step 5: Templates**

Four files under `domain/templates/`, each exporting `{ vi: { title, bodyMd }, en: { title, bodyMd } }` as plain Markdown string constants, plus an index `LEGAL_TEMPLATES`. Placeholders `{{tenantName}}` are substituted by `seedDrafts`. Write real starting text in Vietnamese (a page or so per document: scope, definitions, booking/cancellation, payment, prohibited use, liability, contact) and an English translation of the same. These are drafts, never auto-published.

- [ ] **Step 6: Verify + commit**

```bash
pnpm --filter=@booking/api typecheck && pnpm check:module-cycles
git add apps/api/src/modules/legal
git commit -m "feat(api): legal ports, prisma repositories, document templates"
```

---

## Task 5: Legal use-cases

**Files:**
- Create: the twelve files listed under `application/use-cases/` in File Structure, plus `application/legal.mapper.ts`

**Interfaces:**
- Consumes: Task 3 kernels, Task 4 ports.
- Produces: `GetTenantLegalUseCase.execute(tenantId): Promise<TenantLegalOverview>`, `SaveLegalDraftUseCase.execute(tenantId, docType, input)`, `PublishLegalDocumentUseCase.execute(tenantId, docType, input, ctx: { userId })`, `WithdrawLegalDocumentUseCase.execute(tenantId, docType)`, `GetPublicLegalDocumentUseCase.execute(tenantId, docType, locale): Promise<LegalDocumentResponse>`, `ListPublicLegalDocumentsUseCase.execute(tenantId, locale)`, `SeedTenantLegalDraftsUseCase.execute(tenantId, tx?)`, `RecordLegalAcceptanceUseCase.execute(tx, args)`, `ListPendingAcceptancesUseCase.execute(tenantId, userId, scope)`, `ListMyAcceptancesUseCase.execute(tenantId, userId)`, `ListPartnerAcceptancesUseCase.execute(tenantId, partnerId)`, `RecordRegistrationConsentUseCase.execute(tenantId, payload)`.

- [ ] **Step 1: `publish-legal-document.use-case.ts` — the one that carries the design**

This is the only use-case with non-obvious logic; the rest are thin. It must, inside **one** `forTenant` transaction: load the document, assert a draft exists, assert the draft covers `defaultLocale`, compute `nextVersionNo`, publish, recompute readiness over **all four** documents, and emit the readiness event.

```ts
@Injectable()
export class PublishLegalDocumentUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: ILegalDocumentRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    docType: LegalDocumentType,
    input: PublishLegalDocumentInput,
    ctx: { userId: string },
  ): Promise<void> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFound();
    const defaultLocale = tenant.defaultLocale as Locale;

    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const doc = await this.documents.findByType(tx, tenantId, docType);
      if (!doc) throw new LegalDocumentNotFound();
      const draft = doc.versions.find((v) => v.publishedAt === null);
      if (!draft) throw new LegalDraftMissing();

      LegalDocument.assertPublishable(
        draft.translations.map((t) => t.locale),
        defaultLocale,
      );

      await this.documents.publish(tx, {
        tenantId,
        documentId: doc.id,
        draftVersionId: draft.id,
        versionNo: LegalDocument.nextVersionNo(doc.versions.filter((v) => v.publishedAt !== null)),
        isMaterialChange: input.material,
        publishedByUserId: ctx.userId,
      });

      await this.emitReadiness(tx, tenantId, defaultLocale);
    });
  }

  /**
   * Readiness is computed HERE, in the module that owns the documents, and
   * shipped as a boolean + count in the payload. tenancy's handler then writes
   * two columns and imports nothing from legal — which is what keeps
   * `pnpm check:module-cycles` green, since legal already imports tenancy.
   */
  private async emitReadiness(tx: PrismaTx, tenantId: string, defaultLocale: Locale): Promise<void> {
    const all = await this.documents.listAll(tx, tenantId);
    const readiness = computeLegalReadiness(
      all.map((d) => ({
        docType: d.docType,
        publishedLocales:
          d.versions.find((v) => v.id === d.currentVersionId)?.translations.map((t) => t.locale) ?? [],
      })),
      defaultLocale,
    );
    await this.outbox.emit(tx, {
      tenantId,
      eventType: 'legal.readiness_changed',
      payload: { legalReady: readiness.legalReady, publishedCount: readiness.publishedCount },
    });
  }
}
```

`WithdrawLegalDocumentUseCase` is the mirror image: clear `currentVersionId`, then the same `emitReadiness`. Extract `emitReadiness` into a shared private only if both files would otherwise duplicate more than ten lines — a small duplication is preferable to a service class (ADR 0006).

A **material** publish additionally emits a second event so notification can mail partners/affiliates:

```ts
      if (input.material) {
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'legal.document_published',
          payload: { docType, versionId: draft.id, versionNo, isMaterialChange: true },
        });
      }
```

- [ ] **Step 2: `record-legal-acceptance.use-case.ts` — the shared writer**

Takes an **existing `tx`** (it is always called from inside another module's `forTenant`) and writes one row per accepted version after validating each is its document's current version:

```ts
  async execute(
    tx: PrismaTx,
    args: {
      tenantId: string;
      userId: string;
      partnerId?: string | null;
      acceptedVersionIds: readonly string[];
      acceptedLocale: Locale;
      ip?: string | null;
    },
  ): Promise<void> {
    for (const versionId of args.acceptedVersionIds) {
      const version = await this.documents.findVersionById(tx, versionId);
      if (!version || version.publishedAt === null) throw new LegalVersionStale();
      const doc = await this.documents.findByType(tx, args.tenantId, version.docType);
      // A stale tab must not produce a signature for text nobody saw.
      if (!doc || doc.currentVersionId !== versionId) throw new LegalVersionStale();
      await this.acceptances.record(tx, {
        tenantId: args.tenantId,
        userId: args.userId,
        partnerId: args.partnerId ?? null,
        agreementType: version.docType,
        documentVersionId: versionId,
        acceptedLocale: args.acceptedLocale,
        version: String(version.versionNo),
        ip: args.ip ?? null,
      });
    }
  }
```

- [ ] **Step 3: The remaining ten use-cases**

Each is one file, one `@Injectable`, one public `execute()`, opening `forTenant` and delegating to the ports. Exact signatures and the one non-obvious rule per file:

| File | Signature | Rule |
| --- | --- | --- |
| `get-tenant-legal.use-case.ts` | `execute(tenantId): Promise<TenantLegalOverview>` | Reads the tenant for `defaultLocale`, then `listAll`; `readyInDefaultLocale` per document comes from the **current** version's translations, not the draft's. |
| `save-legal-draft.use-case.ts` | `execute(tenantId, docType, input: SaveLegalDraftInput): Promise<void>` | `upsertDraft` replaces the whole draft, so the caller always sends every locale it wants kept. |
| `withdraw-legal-document.use-case.ts` | `execute(tenantId, docType): Promise<void>` | Clears `currentVersionId`, then emits `legal.readiness_changed` exactly like publish. Never deletes versions. |
| `get-public-legal-document.use-case.ts` | `execute(tenantId, docType, requestedLocale, versionNo?): Promise<LegalDocumentResponse>` | Applies `resolveLegalLocale` and returns `servedLocale` + `fellBack`. Throws `LegalDocumentNotFound` when `currentVersionId` is null — a draft is never public. |
| `list-public-legal-documents.use-case.ts` | `execute(tenantId, requestedLocale): Promise<LegalDocumentSummary[]>` | Published documents only; same locale rule. |
| `seed-tenant-legal-drafts.use-case.ts` | `execute(tenantId, tx?: PrismaTx): Promise<void>` | Accepts an optional `tx` so `CreateTenantUseCase` can call it inside its own transaction rather than nesting `forTenant`. |
| `list-pending-acceptances.use-case.ts` | `execute(tenantId, userId, scope: 'partner' \| 'affiliate' \| 'customer'): Promise<PendingAcceptance[]>` | Passes the matching type list — `['partner_terms']`, `['affiliate_terms']`, `['customer_terms','privacy_policy']` — to `pendingTypes`, then loads each version's text in the user's locale. |
| `list-my-acceptances.use-case.ts` | `execute(tenantId, userId): Promise<AcceptanceRecord[]>` | Plain `listByUser`, newest first. |
| `list-partner-acceptances.use-case.ts` | `execute(tenantId, partnerId): Promise<AcceptanceRecord[]>` | Replaces the deleted `ListPartnerAgreementsUseCase`; same response shape so `profile.tsx:45` keeps working. |
| `record-registration-consent.use-case.ts` | `execute(tenantId, payload: { userId; acceptedVersionIds; acceptedLocale; ip }): Promise<void>` | Outbox handler target (D5). Opens `forTenant` and delegates to `RecordLegalAcceptanceUseCase`. Must tolerate redelivery — the relay is at-least-once (`outbox-relay.worker.ts` `MAX_ATTEMPTS = 20`), and duplicate acceptance rows are acceptable per D9. |

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter=@booking/api typecheck && pnpm check:module-cycles
git add apps/api/src/modules/legal/application
git commit -m "feat(api): legal use-cases — draft, publish, withdraw, acceptance, readiness event"
```

---

## Task 6: Legal HTTP layer, guard, module, permission

**Files:**
- Create: `infrastructure/http/{legal.module.ts, tenant-legal.controller.ts, public-legal.controller.ts, me-legal.controller.ts, dto/legal.dto.ts, guards/require-current-agreement.guard.ts}`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/modules/identity-access/domain/permission-catalog.ts`

- [ ] **Step 1: DTOs** — one line each, `export class XDto extends createZodDto(xSchema) {}`, matching `tenancy.dto.ts:61-62`.

- [ ] **Step 2: Controllers**

`tenant-legal.controller.ts` — `@Controller('tenant/legal')`, every route `@RequirePermissions('tenant.legal.manage')`, writes additionally `@UseGuards(RequireActiveSubscriptionGuard)`; tenant id from `this.tenantContext.tenantIdOrThrow()`. Routes: `GET /`, `PUT /:docType/draft`, `POST /:docType/publish`, `DELETE /:docType/publish`.

`public-legal.controller.ts` — `@Controller('public/legal')`, every route `@Public()`. Three routes:

| Method + path | Use-case | Returns |
| --- | --- | --- |
| `GET /` | `ListPublicLegalDocumentsUseCase` | `LegalDocumentSummary[]` — footer link data |
| `GET /:docType?locale=` | `GetPublicLegalDocumentUseCase` | `LegalDocumentResponse` (current published version) |
| `GET /:docType/versions/:versionNo?locale=` | `GetPublicLegalDocumentUseCase` (version overload) | `LegalDocumentResponse` for a superseded version |

It has **no tenant context**, so it resolves the host exactly as `PublicTenantController` does:

```ts
  private hostOf(forwardedHost?: string, host?: string): string {
    const resolved = forwardedHost?.split(',')[0]?.trim() || host;
    if (!resolved) throw new MissingTenantHost();
    return resolved;
  }
```

then `const tenant = await this.resolveTenant.execute(hostOf(...))` and passes `tenant.id` into the use-case. **Drafts are never reachable from a public route.**

`me-legal.controller.ts` — `@Controller('me/legal')`, `@AuthenticatedOnly()`, `@CurrentPrincipal()`. Routes `GET /pending`, `POST /accept`, `GET /acceptances`.

- [ ] **Step 3: `RequireCurrentAgreementGuard`**

Modelled on `RequireActiveSubscriptionGuard` (read it first). Reads the principal + tenant context, calls `ListPendingAcceptancesUseCase`, throws `LegalAgreementOutdated` when non-empty. Exported from `LegalModule` so `partner` and `affiliate` can import it — importing another module's guard is explicitly allowed by `AGENTS.md`.

- [ ] **Step 4: `legal.module.ts`**

```ts
@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule],
  controllers: [TenantLegalController, PublicLegalController, MeLegalController],
  providers: [
    PrismaLegalDocumentRepository,
    { provide: LEGAL_DOCUMENT_REPOSITORY, useExisting: PrismaLegalDocumentRepository },
    PrismaAgreementAcceptanceRepository,
    { provide: AGREEMENT_ACCEPTANCE_REPOSITORY, useExisting: PrismaAgreementAcceptanceRepository },
    GetTenantLegalUseCase,
    SaveLegalDraftUseCase,
    PublishLegalDocumentUseCase,
    WithdrawLegalDocumentUseCase,
    GetPublicLegalDocumentUseCase,
    ListPublicLegalDocumentsUseCase,
    SeedTenantLegalDraftsUseCase,
    RecordLegalAcceptanceUseCase,
    ListPendingAcceptancesUseCase,
    ListMyAcceptancesUseCase,
    ListPartnerAcceptancesUseCase,
    RecordRegistrationConsentUseCase,
    RequireCurrentAgreementGuard,
  ],
  exports: [
    AGREEMENT_ACCEPTANCE_REPOSITORY,
    LEGAL_DOCUMENT_REPOSITORY,
    RecordLegalAcceptanceUseCase,
    ListPendingAcceptancesUseCase,
    ListPartnerAcceptancesUseCase,
    RequireCurrentAgreementGuard,
  ],
})
export class LegalModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly recordRegistrationConsent: RecordRegistrationConsentUseCase,
  ) {}

  onModuleInit(): void {
    // D5: identity-access cannot import legal (cycle), so registration consent
    // arrives as an event. Registering the handler here creates no import edge.
    this.registry.register('user.registration_consent', (event) => {
      if (!event.tenantId) return Promise.resolve();
      return this.recordRegistrationConsent.execute(event.tenantId, event.payload as never);
    });
  }
}
```

`OutboxModule` and `TenantContextModule` are `@Global()`, so only `TenancyModule` needs importing (for `RequireActiveSubscriptionGuard` + `ResolveTenantByHostUseCase` + `TENANT_REPOSITORY`).

- [ ] **Step 5: Register in `app.module.ts`** beside the other 17 modules.

- [ ] **Step 6: Permission (D8)**

In `permission-catalog.ts`, add to the tenant block (after `:329`'s `tenant.settings.manage`):

```ts
  { key: 'tenant.legal.manage', scopeLevel: 'tenant' },
```

and — because `keysOf('tenant')` would otherwise hand it to Manager automatically — extend the Manager filter at `:86-91`:

```ts
    permissions: keysOf('tenant').filter(
      (k) =>
        k !== 'tenant.roles.manage' &&
        k !== 'tenant.settings.manage' &&
        k !== 'tenant.legal.manage',
    ),
```

- [ ] **Step 7: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm check:module-cycles
pnpm --filter=@booking/api start:dev   # boots? then Ctrl-C
```

Expected from `check:module-cycles`: `18 modules, import graph is acyclic.` If it reports a cycle, something in `tenancy` imported `legal` — revert that and move the logic behind the event payload (D1).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/legal apps/api/src/app.module.ts apps/api/src/modules/identity-access/domain/permission-catalog.ts
git commit -m "feat(api): legal controllers, agreement guard, module wiring, tenant.legal.manage"
```

---

## Task 7: The hard gate in tenancy

**Files:**
- Modify: `tenancy/domain/ports/tenant-repository.port.ts` (`TenantRecord` `:6-20`, `ITenantRepository` `:56-79`), `tenancy/infrastructure/repositories/prisma-tenant.repository.ts` (`toRecord` `:17-32`), `tenancy/application/use-cases/resolve-tenant-by-host.use-case.ts:64` + docblock `:21-27`, `tenancy/application/use-cases/get-subscription-status.use-case.ts`, `tenancy/application/tenancy.mapper.ts:123-138`, `tenancy/infrastructure/http/tenancy.module.ts:134`
- Create: `tenancy/application/use-cases/apply-legal-readiness.use-case.ts`

- [ ] **Step 1: Port + mapper**

`TenantRecord` gains `legalReadyAt: Date | null;` and `legalDocumentsReady: number;`. `toRecord` gains the two lines. **Do not touch `UpdateTenantData`** — exposing the gate to the platform-admin tenant PATCH body would let it be set by hand. Instead add one method to `ITenantRepository`:

```ts
  /**
   * Stamps or clears the legal-readiness marker. Separate from `update()`
   * because the only writer is the legal-readiness outbox handler, never the
   * platform-admin tenant form.
   */
  setLegalReadiness(tenantId: string, at: Date | null, publishedCount: number): Promise<void>;
```

implemented on `this.prisma.admin.tenant.update` (the `tenants` table is not RLS-scoped; every other method in the class uses the admin pool).

- [ ] **Step 2: The gate — one line**

`resolve-tenant-by-host.use-case.ts:64`:

```ts
    const live =
      tenant.status === 'active' && evaluation.storefrontLive && tenant.legalReadyAt !== null;
```

and amend the docblock at `:21-27`, which currently claims `live` derives from "tenant status + subscription".

**Do not add cache invalidation.** `ITenantCache` stores only `host:<hostname>` → tenantId for 60s; lines `:52`, `:59` and `:64` run on every request, cache hit or miss. Publishing the fourth document un-darks the storefront on the very next request. (`UpdateTenantUseCase:32-35` evicts on status change — that eviction is already redundant against this cache. Do not copy it.)

Note two free consequences, which are correct and must **not** be re-implemented: `checkout.use-case.ts:84` and `create-booking.use-case.ts:104` both branch on `tenant.live`, so a legally-unready tenant already cannot take a booking or start a checkout.

- [ ] **Step 3: Surface it to the dashboard (D3)**

`GetSubscriptionStatusUseCase` injects `GetTenantUseCase` (same module, already provided; `get-subscription-status.use-case.ts:27-30` already injects two sibling use-cases this way) and adds to its returned view:

```ts
      legalReady: tenant.legalReadyAt !== null,
      legalDocumentsReady: tenant.legalDocumentsReady,
```

`toSubscriptionStatusResponse` passes both through. **`storefrontLive` stays subscription-only** — `settings-overview.tsx:83-85` renders it beside a "Gói dịch vụ" panel and would otherwise show "Storefront tạm ngưng" with a false cause.

Also a deliberate no-op to record in the commit message: `toPublicTenantResponse` (`tenancy.mapper.ts:111-121`) does **not** gain the field. That payload is `@Public()`; "this tenant has no terms of service" is not something to hand to anyone who curls a host.

- [ ] **Step 4: The outbox handler**

`apply-legal-readiness.use-case.ts`:

```ts
@Injectable()
export class ApplyLegalReadinessUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository) {}

  async execute(tenantId: string, input: { legalReady: boolean; publishedCount: number }): Promise<void> {
    await this.tenants.setLegalReadiness(
      tenantId,
      input.legalReady ? new Date() : null,
      input.publishedCount,
    );
  }
}
```

It imports **nothing** from `legal` — that is the whole point of D1.

`TenancyModule` becomes `implements OnModuleInit` (it is a bare `export class TenancyModule {}` at `:134` today) and registers the handler, copying the shape from `ListingModule:202-225` including its `requireTenantId` warn-and-skip helper:

```ts
    this.registry.register('legal.readiness_changed', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.applyLegalReadiness.execute(
        tenantId,
        (event.payload ?? {}) as { legalReady: boolean; publishedCount: number },
      );
    });
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm check:module-cycles && pnpm --filter=@booking/api check:rls
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/tenancy
git commit -m "feat(api): gate the storefront on published legal documents"
```

---

## Task 8: Partner — delete the old port, move consent to application time

**Files:**
- Delete: `partner/domain/ports/agreement-repository.port.ts`, `partner/infrastructure/repositories/prisma-agreement.repository.ts`, `partner/application/use-cases/list-partner-agreements.use-case.ts`
- Modify: `partner/domain/entities/partner.entity.ts` (`:62-73`, `:243-265`), `partner/domain/agreement-versions.ts`, `partner/application/use-cases/approve-partner.use-case.ts`, `partner/application/use-cases/apply-as-partner.use-case.ts`, `partner/infrastructure/http/partner.module.ts` (`:9,12,53`), `partner/infrastructure/http/partner-application.controller.ts`, `partner/infrastructure/http/partner-profile.controller.ts`

- [ ] **Step 1: Stop the tenant signing for the partner**

`partner.entity.ts`: `PartnerAgreementIntent.agreementType` narrows to `'commission_schedule'`; `PartnerApprovalOutcome.agreements` becomes `[PartnerAgreementIntent]`; `approve()` returns only the commission-schedule entry. Delete `CURRENT_PARTNER_TERMS_VERSION` from `agreement-versions.ts` and its import — it becomes dead.

`approve-partner.use-case.ts`: swap `AGREEMENT_REPOSITORY`/`IAgreementRepository` for `AGREEMENT_ACCEPTANCE_REPOSITORY`/`IAgreementAcceptanceRepository`; the loop body now passes `documentVersionId: null, acceptedLocale: null`. Update the class docblock — it currently says "Fee-schedule + partner-terms acceptance is recorded … at approval", which stops being true.

- [ ] **Step 2: Record real consent at application time**

`apply-as-partner.use-case.ts` gains a third argument `ctx: { ip?: string | null }` (mirroring `ApproveContext`), injects `RecordLegalAcceptanceUseCase`, and calls it **inside the existing `forTenant` callback** right after `this.partners.create(tx, newPartner)`:

```ts
      await this.recordLegalAcceptance.execute(tx, {
        tenantId: input.tenantId,
        userId,
        partnerId: created.id,
        acceptedVersionIds: input.legalConsent.acceptedVersionIds,
        acceptedLocale: input.legalConsent.acceptedLocale,
        ip: ctx.ip,
      });
```

Per D6 the form submits three version ids (partner terms + customer terms + privacy policy), and `RecordLegalAcceptanceUseCase` writes one row per id with the right `agreementType` derived from each version's document. There is no state where a partner exists without their signature — same transaction.

`partner-application.controller.ts` adds `@Ip() ip: string` and forwards `{ ip }`.

- [ ] **Step 3: Re-point the profile agreements route**

`partner-profile.controller.ts` keeps `GET /partner/profile/agreements` (deleting it breaks `apps/dashboard/app/routes/partner/profile.tsx:45`) but now injects `ListPartnerAcceptancesUseCase` from `legal`. `partner.module.ts` imports `LegalModule` and drops the three `AGREEMENT_REPOSITORY` lines.

- [ ] **Step 4: Verify**

```bash
pnpm --filter=@booking/api typecheck && pnpm check:module-cycles
```

Expected: `partner → legal` edge added, still acyclic. `grep -rn "AGREEMENT_REPOSITORY" apps/api/src` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/modules/partner
git commit -m "fix(api): partner accepts their own terms at application, not the tenant at approval"
```

---

## Task 9: Affiliate consent

**Files:** Modify `affiliate/application/use-cases/apply-affiliate.use-case.ts`, `affiliate/infrastructure/http/affiliate.controller.ts`, `affiliate/infrastructure/http/affiliate.module.ts`

- [ ] **Step 1:** Thread `ctx: { ip?: string | null }` and `input.legalConsent` into `private async create(tx, application, consent, ctx)` — the **only** branch that creates a membership (`existing?.id ?? (await this.create(...))`). Writing unconditionally would duplicate a row on every idempotent resubmit, which the spec does not ask for.
- [ ] **Step 2:** Call `RecordLegalAcceptanceUseCase` beside the existing `outbox.emit`, with `partnerId: null`.
- [ ] **Step 3:** Controller adds `@Ip() ip: string`. Module imports `LegalModule`.
- [ ] **Step 4:** `pnpm --filter=@booking/api typecheck && pnpm check:module-cycles`
- [ ] **Step 5:** `git commit -m "feat(api): record affiliate terms acceptance at application"`

---

## Task 10: Checkout consent

**Files:** Modify `booking/application/use-cases/create-booking.use-case.ts` (`insertAndActivate`, `CreateBookingContext` `:66-70`), `booking/infrastructure/http/public-booking.controller.ts:79-88`, `booking/infrastructure/http/booking.module.ts`

- [ ] **Step 1:** Add `ip?: string | null` to `CreateBookingContext`; controller adds `@Ip() ip: string` and passes it.
- [ ] **Step 2:** Thread `ip` and `input.acceptedVersionIds` / `input.acceptedLocale` through `common` → `args` into `insertAndActivate`.
- [ ] **Step 3:** Call `RecordLegalAcceptanceUseCase` between `applyTransition` and `this.outbox.emit`, mirroring how `reservePromotion.execute(tx, tenantId, …)` is already called there. Skip silently when `acceptedVersionIds` is absent — a booking made through a channel that never rendered the notice must not 500.
- [ ] **Step 4:** Idempotency is already safe: both call sites re-check `findByIdempotencyKey` inside the tx and return before reaching `insertAndActivate`, so the row is written exactly once per booking.
- [ ] **Step 5:** `pnpm --filter=@booking/api typecheck && pnpm check:module-cycles`
- [ ] **Step 6:** `git commit -m "feat(api): record customer terms acceptance with each booking"`

---

## Task 11: Registration consent via outbox (D5)

**Files:** Modify `identity-access/domain/ports/auth-challenge-store.port.ts` (`AuthChallengePayload`), `identity-access/application/use-cases/start-registration.use-case.ts`, `identity-access/application/use-cases/complete-registration.use-case.ts`, `identity-access/infrastructure/http/public-auth.controller.ts`

- [ ] **Step 1:** `AuthChallengePayload` gains `acceptedVersionIds?: string[]` and `acceptedLocale?: 'vi' | 'en'`. `StartRegistrationUseCase` parks them on the challenge exactly as it already conditionally parks `tenantId` (`...(input.tenantId ? { tenantId: input.tenantId } : {})`).
- [ ] **Step 2:** `CompleteRegistrationUseCase` currently discards `payload.tenantId`. After `this.users.create(newUser)` returns the record, when `payload.tenantId` **and** `payload.acceptedVersionIds` are both present, open a tenant transaction purely to emit:

```ts
    const user = await this.users.create(newUser);
    if (payload.tenantId && payload.acceptedVersionIds?.length) {
      await this.tenantDb.forTenant(payload.tenantId, (tx) =>
        this.outbox.emit(tx, {
          tenantId: payload.tenantId,
          eventType: 'user.registration_consent',
          payload: {
            userId: user.id,
            acceptedVersionIds: payload.acceptedVersionIds,
            acceptedLocale: payload.acceptedLocale ?? 'vi',
            ip: input.ip ?? null,
          },
        }),
      );
    }
```

State plainly in the code comment why this is not atomic with the user insert: `PrismaUserRepository.create` runs `this.prisma.admin.user.create` on the BYPASSRLS pool outside any transaction, by design ("users is a global (non-tenant) table … RLS does not apply to identity data"), and `identity-access → legal` is a module cycle. The event is the sanctioned crossing (`AGENTS.md`: write-path side effects cross module lines via the outbox).

- [ ] **Step 3:** `public-auth.controller.ts` adds `@Ip() ip: string` to `registration/complete` (it currently has none; `POST /auth/register` at `:161-173` already does) and threads it into the input.
- [ ] **Step 4:** `pnpm --filter=@booking/api typecheck && pnpm check:module-cycles` — the graph must be unchanged for `identity-access`.
- [ ] **Step 5:** `git commit -m "feat(api): emit registration consent for the legal module to record"`

---

## Task 12: Templates on tenant creation + seed

**Files:** Modify `tenancy/application/use-cases/create-tenant.use-case.ts`, `apps/api/prisma/seed/tenants/booking-studio.ts`, `apps/api/prisma/seed/tenants/booking-stad.ts`, `apps/api/prisma/seed/demo/studio-demo.ts:113-128`

- [ ] **Step 1:** `CreateTenantUseCase` calls `SeedTenantLegalDraftsUseCase` inside its existing transaction. A new tenant therefore starts **dark with four drafts** — intended, not a regression: auto-publishing on the owner's behalf would make the gate decorative.
- [ ] **Step 2:** Seed, honouring the existing scope split: `SEED_SCOPE=tenants` creates **drafts only**; the dev/staging default creates **and publishes** all four for both demo tenants with `publishedByUserId` = the seeded owner, so `pnpm dev` does not bring up two dark storefronts.
- [ ] **Step 3:** `studio-demo.ts:113-128` currently iterates `['partner_terms', 'commission_schedule']` writing acceptance rows directly. Update it so `partner_terms` carries a real `document_version_id` (the seeded published version) and `commission_schedule` keeps `null`.
- [ ] **Step 4:** Verify:

```bash
pnpm --filter=@booking/api exec prisma migrate reset --force
pnpm --filter=@booking/api seed
psql "$DATABASE_URL" -c "SELECT slug, legal_ready_at IS NOT NULL AS ready, legal_documents_ready FROM tenants;"
```

Expected: both demo tenants `ready = t`, `legal_documents_ready = 4`.

- [ ] **Step 5:** `git commit -m "feat(api): seed legal drafts on tenant creation, publish them for demo tenants"`

---

## Task 13: Restricted Markdown renderer (D7)

**Files:** Create `packages/ui/components/markdown/restricted-markdown.tsx`

No markdown or sanitizer library exists anywhere in the repo, and `check-storefront-security.mjs` does **not** check for HTML injection — so a `dangerouslySetInnerHTML` approach would rest on an unenforced convention. This renderer emits React elements, so injection is impossible by construction and no dependency is added.

- [ ] **Step 1:** Implement `RestrictedMarkdown({ source }: { source: string })` supporting exactly: ATX headings `#`–`###`, paragraphs, unordered `-` lists, ordered `1.` lists, `**bold**`, `*italic*`, `[text](https://…)` (http/https only — any other scheme renders as plain text), and blank-line separation. Everything else renders as literal text. No raw HTML passthrough, no image syntax, no `dangerouslySetInnerHTML` anywhere in the file.
- [ ] **Step 2:** Export it from the package the way `packages/ui` exports its other components (read a sibling first — the package is raw TSX with no build step).
- [ ] **Step 3:** Verify: `pnpm --filter=@booking/ui typecheck && pnpm lint`
- [ ] **Step 4:** `git commit -m "feat(ui): restricted markdown renderer with no HTML passthrough"`

---

## Task 14: Dashboard — the "Pháp lý" tab

**Files:** Create `apps/dashboard/app/features/tenant/components/settings/legal-documents-card.tsx`, `.../legal-publish-dialog.tsx`, `apps/dashboard/app/features/legal/server/legal.server.ts`; modify `apps/dashboard/app/routes/tenant/settings.tsx` (`SETTINGS_TAB_BY_FORM` `:42-59`, `settingsTabs` `:153-182`), `apps/dashboard/app/features/tenant/server/settings-actions.server.ts`

- [ ] **Step 1:** Loader fetches `GET /tenant/legal` when `can('tenant.legal.manage')`; add a `legal` tab entry gated on the same permission, plus `SETTINGS_TAB_BY_FORM` entries (`legal-draft`, `legal-publish`, `legal-withdraw` → `'legal'`) so a submission returns to the right tab.
- [ ] **Step 2:** One card per document type showing state (chưa công bố / bản nháp đang chờ / đã công bố v*n*), a locale switch (`Tiếng Việt` / `English`) choosing which translation the `Textarea` edits, a preview pane using `RestrictedMarkdown`, and the published history.
- [ ] **Step 3:** A locale with no text is labelled *"Chưa có bản tiếng Anh — khách xem tiếng Anh sẽ thấy bản tiếng Việt"*, so the fallback is a visible choice rather than a silent gap. The tenant's `defaultLocale` is marked required and disables the publish button when empty.
- [ ] **Step 4:** The publish dialog forces the classification with the consequence spelled out: **Sửa lỗi chính tả / trình bày** (new version, nobody re-accepts) vs **Thay đổi điều khoản** (new version, partners and CTV must accept again).
- [ ] **Step 5:** Verify by running the dashboard and publishing a document; then `pnpm check:frontend-structure && pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard build`
- [ ] **Step 6:** `git commit -m "feat(dashboard): tenant legal documents tab with locale-aware editor"`

---

## Task 15: Dashboard — readiness card

**Files:** Create `apps/dashboard/app/features/tenant/components/overview/legal-readiness-card.tsx`; modify `apps/dashboard/app/routes/tenant/_index.tsx` (loader `:35-51`, return `:69-78`, right column `:134-165`), `apps/dashboard/app/constants/paths.ts:54`

- [ ] **Step 1:** No new fetch — `_index.tsx` already calls `/tenant/subscription/status` (gated on `tenant.settings.manage`), which now carries `legalReady` + `legalDocumentsReady` from Task 7. Pass both through the loader return.
- [ ] **Step 2:** Render `<LegalReadinessCard published={…} required={4} />` **above** `SubscriptionStatusCard` when `!legalReady` — a dead storefront outranks a subscription snapshot. Copy: *"Storefront chưa lên sóng — còn thiếu {4 − published}/4 tài liệu"*.
- [ ] **Step 3:** Add `settingsSection: (section: string) => \`${tenantPath('/settings')}?section=${segment(section)}\`` to `paths.ts` beside `settings` at `:54`, and link the card to `dashboardPaths.tenant.settingsSection('legal')`. Do **not** hardcode the URL — `_index.tsx:157` already does that and it is pre-existing debt, not a pattern.
- [ ] **Step 4:** Use the `--warning` token via the existing `WarningCallout` (`apps/dashboard/app/components/warning-callout.tsx`), never hardcoded amber.
- [ ] **Step 5:** Note in the commit that a Manager will not see this card, because the subscription leg is gated on `tenant.settings.manage`. That matches today's behaviour for the expiry banner and is a decision, not an oversight.
- [ ] **Step 6:** `pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard build`, then `git commit -m "feat(dashboard): legal readiness card on the tenant overview"`

---

## Task 16: Dashboard — re-acceptance interstitial

**Files:** Create `apps/dashboard/app/routes/partner/legal-update.tsx`, `apps/dashboard/app/routes/affiliate/legal-update.tsx`; modify the partner and affiliate area layout loaders, `apps/dashboard/app/routes.ts`, `apps/dashboard/app/constants/paths.ts`

- [ ] **Step 1:** Both layout loaders call `GET /me/legal/pending` and `redirect()` to the interstitial when it returns anything. Guard against a redirect loop: the interstitial route itself must not perform the check.
- [ ] **Step 2:** The screen renders each pending document with `RestrictedMarkdown` and one "Tôi đồng ý" action posting `POST /me/legal/accept` with `versionIds` + `acceptedLocale`.
- [ ] **Step 3:** The loader redirect alone is not enforcement — apply `RequireCurrentAgreementGuard` (Task 6) to the **write** routes of the partner and affiliate scopes in the API. Read routes stay open so a blocked user can still see their own data.
- [ ] **Step 4:** `pnpm --filter=@booking/dashboard typecheck && pnpm --filter=@booking/dashboard build`
- [ ] **Step 5:** `git commit -m "feat(dashboard): block partner/affiliate writes until updated terms are accepted"`

---

## Task 17: Storefront — public legal pages

**Files:** Create `apps/storefront/app/routes/legal.tsx`, `apps/storefront/app/features/legal/components/legal-document-page.tsx`, `apps/storefront/app/features/legal/server/legal.server.ts`; modify `apps/storefront/app/routes.ts`, `apps/storefront/app/constants/paths.ts`, `apps/storefront/app/features/site-shell/components/site-footer.tsx`, `apps/storefront/app/features/root/server/request-security.server.ts:259-262`

- [ ] **Step 1: The gate exemption — this is real work, not free**

`tenantUnavailableResponse` is thrown from the **root middleware** (`request-security.server.ts:259-262`, wired at `root.tsx:15`), so it kills `/vi/legal/...` before the route runs. Add a path exemption alongside the existing `OPERATIONAL_PATHS` (`:13`) and `PLATFORM_DOCUMENT_PATHS` (`:14`) sets, so a dark storefront still serves its terms. Without this, spec rule "legal pages bypass the hard gate" silently does not hold.

- [ ] **Step 2:** Route `/:locale/legal/:docSlug` (and `/:locale/legal/:docSlug/v/:versionNo` for historical versions) resolving the slug through `LEGAL_DOCUMENT_TYPE_BY_SLUG`, loading via `GET /public/legal/:docType?locale=`.
- [ ] **Step 3:** When `fellBack` is true, render the notice *"Bản tiếng Anh chưa có. Đây là bản tiếng Việt đang có hiệu lực."* above the document and set `Content-Language` to `servedLocale`, not the requested one.
- [ ] **Step 4:** Footer links all four documents; add the paths to `storefrontPaths`.
- [ ] **Step 5:** The platform landing keeps its static i18n page — a single-label host (`localhost`) or bare IP resolves to no tenant, so there is nothing to serve. Do not touch `routes/legacy/*` or the platform footer.
- [ ] **Step 6:** `pnpm --filter=@booking/storefront security && pnpm --filter=@booking/storefront typecheck && pnpm --filter=@booking/storefront build`
- [ ] **Step 7:** `git commit -m "feat(storefront): tenant legal pages with locale fallback, exempt from the gate"`

---

## Task 18: Storefront — consent ticks

**Files:** Modify `apps/storefront/app/features/auth/components/auth-start-form.tsx`, `.../hooks/use-auth-start-form-controller.ts`, `apps/storefront/app/routes/auth/register.tsx` (loader), `apps/storefront/app/features/partner-onboarding/components/partner-profile-page.tsx:127-137`, `.../server/partner-onboarding-domain.ts:43-79`, `.../server/partner-profile-route.server.ts`, `apps/storefront/app/features/affiliate/hooks/use-affiliate-application-page-controller.ts`, `.../server/affiliate-application-route.server.ts`, `apps/storefront/app/features/affiliate/server/affiliate.server.ts`, the checkout page + `features/booking/server/booking.server.ts`

- [ ] **Step 1: Customer registration.** `register.tsx`'s loader fetches nothing today — extend it to load the tenant's current `customer_terms` + `privacy_policy` versions. Add the required checkbox to the `mode === 'register'` branch of `auth-start-form.tsx` between the email field and the submit button, add the fields to `createAuthStartSchema` + `defaultValues` (values post as URL-encoded form data, so a boolean arrives as `"true"`/`"false"`). `startAuthFlowAction` already injects `tenantId` from `getOptionalStorefrontTenant()`, and `formFields` passes new fields straight through.
- [ ] **Step 2: Partner.** The checkbox **already exists** (`partner-profile-page.tsx:130-135`, `partnerOnboardingProfileSchema:271`) and is silently dropped by `partnerApplyPayloadFor` — it never reaches the API. Forward it: extend the consent copy to name all three documents (D6), have `loadPartnerProfileRoute` fetch their current version ids, and map `legalConsent` into the payload.
- [ ] **Step 3: Affiliate.** Add the checkbox to `createFields` and the three fields to `affiliateRegistrationSchema`; `loadAffiliateApplicationRoute` fetches the version ids; `submitAffiliateApplication` forwards `legalConsent` through `AffiliateApplyPayload`.
- [ ] **Step 4: Checkout.** Notice line plus links — **no tick** — and pass `acceptedVersionIds` + `acceptedLocale` on the `createBooking` payload.
- [ ] **Step 5:** `pnpm --filter=@booking/storefront security && pnpm --filter=@booking/storefront typecheck && pnpm --filter=@booking/storefront build`
- [ ] **Step 6:** `git commit -m "feat(storefront): consent capture at registration, partner, affiliate and checkout"`

---

## Task 19: Storefront — "điều khoản tôi đã đồng ý"

**Files:** Create `apps/storefront/app/features/account/components/legal/my-acceptances-page.tsx`; modify `apps/storefront/app/routes/account/terms.tsx`

- [ ] **Step 1:** Replace the static `TermsPage` (four i18n strings) with a list of this user's acceptances from `GET /me/legal/acceptances`: type, version number, date, language read, and a link to that exact version's text. Leave the sibling `security-page.tsx` alone — it is not one of the four documents.
- [ ] **Step 2:** Reading a superseded version by id must keep working forever; link to the `/v/:versionNo` route from Task 17.
- [ ] **Step 3:** `pnpm --filter=@booking/storefront typecheck && pnpm --filter=@booking/storefront build`
- [ ] **Step 4:** `git commit -m "feat(storefront): account page lists the terms this user accepted"`

---

## Task 20: Notification — material-change emails

**Files:** Modify `apps/api/src/modules/notification/infrastructure/http/notification.module.ts` (or wherever that module registers handlers — read it first), `notification/domain/email-template.ts`, `notification/application/use-cases/` (one new dispatch use-case), `notification/infrastructure/email/` (one new template component)

The spec requires partners and affiliates to be told when terms change materially. Task 5 emits `legal.document_published` for exactly that, but nothing consumes it yet.

- [ ] **Step 1:** Register a handler for `legal.document_published` in the notification module, copying the `OnModuleInit` + `requireTenantId` shape from `ListingModule:202-225`.
- [ ] **Step 2:** The handler mails **active partners** when `docType === 'partner_terms'` and **active affiliates** when `docType === 'affiliate_terms'`. It does nothing for `customer_terms` / `privacy_policy` — a tenant may have thousands of customers, and they are handled by the checkout notice instead. Make that skip explicit in code with a comment, not an accidental omission.
- [ ] **Step 3:** The email links to the public document page and says a new version is in effect; it must not embed the document body.
- [ ] **Step 4:** `notification` must **not** import `legal` — `legal → identity-access → notification` already exists, so that edge would be a cycle. The event payload carries `docType`, `versionNo` and the tenant id; that is all the mail needs. Verify with `pnpm check:module-cycles`.
- [ ] **Step 5:** `pnpm --filter=@booking/api typecheck && pnpm check:module-cycles`
- [ ] **Step 6:** `git commit -m "feat(api): email partners and affiliates when terms change materially"`

---

## Task 21: Full verification pass

- [ ] **Step 1: The complete static gate**

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build \
  && pnpm --filter=@booking/api check:rls
```

- [ ] **Step 2: Reset, seed, run**

```bash
pnpm --filter=@booking/api exec prisma migrate reset --force
pnpm --filter=@booking/api seed
pnpm --filter=@booking/api storage:init
pnpm dev
```

- [ ] **Step 3: Walk all ten spec verification steps**

1. `bookingstudio.localhost:5173` serves normally; all four documents published; footer links render.
2. Withdraw one document in the dashboard → storefront returns 423, dashboard stays usable and shows the readiness card, `/vi/legal/dieu-khoan-su-dung` still renders.
3. Republish → storefront live again on the next request (no cache flush needed).
4. Register a customer without ticking → blocked; with ticking → two acceptance rows.
5. Apply as partner and as affiliate → acceptance rows with a real `document_version_id` and IP, and **no** `partner_terms` row appears at approval.
6. Publish `partner_terms` as a material change → the partner is redirected to the accept screen and a partner write route returns the guard's error until they accept.
7. `SEED_SCOPE=tenants` on a clean database → four drafts, storefront dark.
8. `/vi/legal/dieu-khoan-su-dung` and `/en/...` serve different text; delete the English translation and `/en` falls back to Vietnamese **with the notice** and `Content-Language: vi`.
9. Clear the tenant's `defaultLocale` translation on one document → storefront goes dark, proving the gate keys on the default locale and not merely on a version existing.
10. Register from `/en` while only Vietnamese exists → the acceptance row carries `accepted_locale = 'vi'`.

- [ ] **Step 4:** Fix anything that fails, then open the PR.

---

## Self-review notes

Checked against the spec section by section; every requirement maps to a task. Three spec statements were **corrected by the code** and the plan follows the code:

1. **Spec:** "the storefront already knows what to do with `live: false` — no new plumbing". **Reality:** `tenantUnavailableResponse` is thrown from root middleware before any route runs, so "legal pages bypass the gate" needs an explicit exemption (Task 17 Step 1).
2. **Spec:** "Free HTML would have to survive `pnpm --filter=@booking/storefront security`". **Reality:** that script checks no such thing, and no markdown/sanitizer library exists in the repo. Hence D7 and Task 13.
3. **Spec:** "`tenancy` recomputes `legal_ready_at`" by reading legal documents. **Reality:** that import direction is a module cycle. Hence D1 — readiness travels in the event payload.

Two spec gaps were filled rather than left ambiguous: the dashboard has no data source for legal readiness (D3 adds two fields to an endpoint the overview already calls), and the spec never said where customer-registration consent is written given that user creation is transaction-less on the admin pool (D5).

One coverage gap was found in this plan's own first draft and fixed: the spec requires partners and affiliates to be emailed on a material change, and the plan emitted `legal.document_published` with nothing consuming it. That is now Task 20.

Type consistency checked across tasks: `RecordLegalAcceptanceUseCase.execute(tx, args)` takes an existing `tx` and is called identically from Tasks 8, 9, 10 and the Task 5 registration handler; `computeLegalReadiness` is called only inside `legal` (Task 5) and its result crosses to `tenancy` as `{ legalReady, publishedCount }`, matching `ApplyLegalReadinessUseCase.execute` in Task 7; `legalConsentInputSchema` is the one shape the partner, affiliate and registration forms all submit.
