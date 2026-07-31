import {
  LEGAL_DOCUMENT_SLUGS,
  type AcceptanceRecord,
  type LegalDocumentResponse,
  type LegalDocumentSummary,
  type LegalDocumentType,
  type LegalTranslation,
  type LegalVersionSummary,
  type Locale,
  type PendingAcceptance,
  type TenantLegalDocument,
  type TenantLegalOverview,
} from '@booking/contracts';
import type { ResolvedLegalLocale } from '../domain/locale-resolution';
import type { LegalReadiness } from '../domain/legal-readiness';
import { REQUIRED_DOC_TYPES } from '../domain/legal-document-type';
import type {
  AcceptanceRow,
  PendingRow,
} from '../domain/ports/agreement-acceptance-repository.port';
import type { DocumentRow, TranslationRow, VersionRow } from '../domain/ports/legal-document-repository.port';

function toLegalTranslation(t: TranslationRow): LegalTranslation {
  return { locale: t.locale as Locale, title: t.title, bodyMd: t.bodyMd };
}

function toLegalVersionSummary(v: VersionRow): LegalVersionSummary {
  return {
    versionId: v.id,
    versionNo: v.versionNo,
    isMaterialChange: v.isMaterialChange,
    // history only ever contains published versions — publishedAt is never null here.
    publishedAt: v.publishedAt!.toISOString(),
    locales: v.translations.map((t) => t.locale as Locale),
  };
}

function toTenantLegalDocument(
  row: DocumentRow | undefined,
  docType: LegalDocumentType,
  defaultLocale: Locale,
): TenantLegalDocument {
  if (!row) {
    return {
      docType,
      currentVersionNo: null,
      currentTranslations: [],
      draftTranslations: [],
      hasDraft: false,
      readyInDefaultLocale: false,
      history: [],
    };
  }
  const current = row.versions.find((v) => v.id === row.currentVersionId) ?? null;
  const draft = row.versions.find((v) => v.publishedAt === null) ?? null;
  const published = row.versions
    .filter((v) => v.publishedAt !== null)
    .slice()
    .sort((a, b) => b.versionNo - a.versionNo);

  return {
    docType,
    currentVersionNo: current?.versionNo ?? null,
    currentTranslations: (current?.translations ?? []).map(toLegalTranslation),
    draftTranslations: (draft?.translations ?? []).map(toLegalTranslation),
    hasDraft: draft !== null,
    readyInDefaultLocale: current ? current.translations.some((t) => t.locale === defaultLocale) : false,
    history: published.map(toLegalVersionSummary),
  };
}

/** The dashboard's Pháp lý tab: all four required documents, present or not. */
export function toTenantLegalOverview(
  rows: readonly DocumentRow[],
  defaultLocale: Locale,
  readiness: LegalReadiness,
): TenantLegalOverview {
  return {
    defaultLocale,
    legalReady: readiness.legalReady,
    publishedCount: readiness.publishedCount,
    documents: REQUIRED_DOC_TYPES.map((docType) =>
      toTenantLegalDocument(
        rows.find((r) => r.docType === docType),
        docType,
        defaultLocale,
      ),
    ),
  };
}

/** A published version as the storefront (or the acceptance gate) serves it. */
export function toLegalDocumentResponse(
  docType: LegalDocumentType,
  version: VersionRow,
  requestedLocale: Locale,
  resolved: ResolvedLegalLocale,
  translation: TranslationRow,
): LegalDocumentResponse {
  return {
    docType,
    slug: LEGAL_DOCUMENT_SLUGS[docType],
    versionId: version.id,
    versionNo: version.versionNo,
    // findByType/findVersionById only ever hand this a published version.
    publishedAt: version.publishedAt!.toISOString(),
    requestedLocale,
    servedLocale: resolved.locale,
    fellBack: resolved.fellBack,
    title: translation.title,
    bodyMd: translation.bodyMd,
  };
}

export function toLegalDocumentSummary(response: LegalDocumentResponse): LegalDocumentSummary {
  return {
    docType: response.docType,
    slug: response.slug,
    versionId: response.versionId,
    versionNo: response.versionNo,
    publishedAt: response.publishedAt,
    requestedLocale: response.requestedLocale,
    servedLocale: response.servedLocale,
    fellBack: response.fellBack,
    title: response.title,
  };
}

export function toAcceptanceRecord(row: AcceptanceRow): AcceptanceRecord {
  return {
    agreementType: row.agreementType,
    version: row.version,
    documentVersionId: row.documentVersionId,
    acceptedLocale: row.acceptedLocale as Locale | null,
    acceptedAt: row.acceptedAt.toISOString(),
  };
}

export function toPendingAcceptance(
  pending: PendingRow,
  translation: TranslationRow,
  servedLocale: Locale,
): PendingAcceptance {
  return {
    docType: pending.docType,
    slug: LEGAL_DOCUMENT_SLUGS[pending.docType],
    versionId: pending.versionId,
    versionNo: pending.versionNo,
    title: translation.title,
    bodyMd: translation.bodyMd,
    servedLocale,
  };
}
