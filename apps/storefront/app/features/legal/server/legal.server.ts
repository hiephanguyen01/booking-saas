import {
  legalDocumentResponseSchema,
  legalDocumentSummarySchema,
  LEGAL_DOCUMENT_TYPE_BY_SLUG,
  type LegalDocumentResponse,
  type LegalDocumentSummary,
  type LegalDocumentType,
} from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { z } from 'zod';
import { publicGetData } from '~/lib/server/api.server';
import { optionalData } from '~/lib/server/optional-data.server';

const legalSummaryListSchema = z.array(legalDocumentSummarySchema);

/** `GET /public/legal` — every currently published document; footer + consent-form link data. */
export function fetchLegalDocumentSummaries(
  request: Request,
  locale: Locale,
): Promise<LegalDocumentSummary[]> {
  return publicGetData(request, '/public/legal', {
    query: { locale },
    schema: legalSummaryListSchema,
  });
}

/** `GET /public/legal/:docType?locale=` — the current published version, with body. */
export function fetchLegalDocument(
  request: Request,
  docType: LegalDocumentType,
  locale: Locale,
): Promise<LegalDocumentResponse | null> {
  return publicGetData(request, `/public/legal/${docType}`, {
    query: { locale },
    schema: legalDocumentResponseSchema,
    allowNotFound: true,
  });
}

/** `GET /public/legal/:docType/versions/:versionNo?locale=` — a superseded version, with body. */
export function fetchLegalDocumentVersion(
  request: Request,
  docType: LegalDocumentType,
  versionNo: number,
  locale: Locale,
): Promise<LegalDocumentResponse | null> {
  return publicGetData(request, `/public/legal/${docType}/versions/${versionNo}`, {
    query: { locale },
    schema: legalDocumentResponseSchema,
    allowNotFound: true,
  });
}

/** Storefront URL segment → document type, or `null` for an unknown/legacy slug. */
export function legalDocumentTypeForSlug(slug: string): LegalDocumentType | null {
  return LEGAL_DOCUMENT_TYPE_BY_SLUG[slug] ?? null;
}

export interface LegalConsentBundle {
  /** In the same order as the requested `docTypes`; missing/unpublished documents are skipped. */
  documents: LegalDocumentSummary[];
  /** `documents[].versionId` — exactly what a consenting submission sends as `acceptedVersionIds`. */
  versionIds: string[];
  locale: Locale;
}

/**
 * Fetches the current version of every document a consent gate (registration,
 * partner/affiliate application, checkout) needs to reference, tolerating an
 * upstream hiccup by degrading to an empty bundle rather than failing the page
 * — a live tenant always has all four documents published (the storefront gate
 * in `resolve-tenant-by-host.use-case.ts` guarantees it), so an empty bundle
 * here means "the legal service could not be reached," not "no consent needed."
 * Callers skip rendering/submitting consent when `versionIds` is empty.
 */
export async function loadLegalConsentBundle(
  request: Request,
  locale: Locale,
  docTypes: readonly LegalDocumentType[],
): Promise<LegalConsentBundle> {
  const summaries = await optionalData(fetchLegalDocumentSummaries(request, locale), []);
  const byType = new Map(summaries.map((summary) => [summary.docType, summary]));
  const documents = docTypes.flatMap((docType) => {
    const summary = byType.get(docType);
    return summary ? [summary] : [];
  });
  return {
    documents,
    versionIds: documents.map((document) => document.versionId),
    locale,
  };
}

export interface LegalDocumentRouteResult {
  document: LegalDocumentResponse;
  /** True when the URL asked for a specific `/v/:versionNo`, not the current version. */
  isHistorical: boolean;
}

const VERSION_SPLAT_PATTERN = /^v\/(\d+)$/;

/**
 * Resolves `/:locale/legal/:docSlug` and `/:locale/legal/:docSlug/v/:versionNo`
 * (registered as a single splat route, see `routes/legal.tsx`) against the
 * public legal API. Throws a 404 Response for an unknown slug, a malformed
 * trailing segment, or a document/version the tenant has never published —
 * drafts are never reachable from this public route.
 */
export async function loadLegalDocumentRoute(
  request: Request,
  locale: Locale,
  docSlug: string | undefined,
  splat: string | undefined,
): Promise<LegalDocumentRouteResult> {
  const docType = docSlug ? legalDocumentTypeForSlug(docSlug) : null;
  if (!docType) throw new Response('Not Found', { status: 404 });

  const trimmedSplat = splat?.trim() ?? '';
  if (trimmedSplat === '') {
    const document = await fetchLegalDocument(request, docType, locale);
    if (!document) throw new Response('Not Found', { status: 404 });
    return { document, isHistorical: false };
  }

  const versionMatch = VERSION_SPLAT_PATTERN.exec(trimmedSplat);
  if (!versionMatch) throw new Response('Not Found', { status: 404 });

  const versionNo = Number(versionMatch[1]);
  const document = await fetchLegalDocumentVersion(request, docType, versionNo, locale);
  if (!document) throw new Response('Not Found', { status: 404 });
  return { document, isHistorical: true };
}
