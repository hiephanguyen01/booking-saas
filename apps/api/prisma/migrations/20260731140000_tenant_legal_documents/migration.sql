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
