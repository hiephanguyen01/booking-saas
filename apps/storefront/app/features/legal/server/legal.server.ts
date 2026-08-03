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
import { apiPaths } from '~/constants/api-paths';

const legalSummaryListSchema = z.array(legalDocumentSummarySchema);

/** `GET /public/legal` — every currently published document; footer + consent-form link data. */
export function fetchLegalDocumentSummaries(
  request: Request,
  locale: Locale,
): Promise<LegalDocumentSummary[]> {
  return publicGetData(request, apiPaths.public.legal, {
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
  return publicGetData(request, apiPaths.public.legalDocument(docType), {
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
  return publicGetData(request, apiPaths.public.legalDocumentVersion(docType, versionNo), {
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
  /**
   * The visitor's requested UI locale (the route's `:locale`). Use this for
   * chrome copy and for building `/:locale/legal/...` links — never for what a
   * consent gate records as `acceptedLocale`, which must name the language
   * actually rendered, fallback included (see `acceptedLocale` below).
   */
  locale: Locale;
  /**
   * The locale to submit as `acceptedLocale`: the resolved `servedLocale` of
   * the bundle's lead document (`documents[0]`, the docType the calling gate
   * listed first), not the requested `locale`. Every consent submission
   * schema (`acceptLegalInputSchema`, `legalConsentInputSchema`,
   * `registrationStartInputSchema`) carries exactly one `acceptedLocale` for
   * a multi-document submission, so this cannot vary per document within one
   * gate — it mirrors the "lead document" convention the dashboard's
   * re-acceptance screen already uses (`pending[0]?.servedLocale`, see
   * `legal-reaccept-screen.tsx`). A tenant whose translation coverage differs
   * across the documents in one gate (e.g. an English `customer_terms` but no
   * English `privacy_policy`) cannot be represented faithfully by a single
   * field; recording a locale per document would need a contract change this
   * fix does not make. Falls back to the requested `locale` only when no
   * documents loaded (the degraded/unreachable-legal-service path, where
   * `versionIds` is empty and callers skip submitting consent entirely).
   */
  acceptedLocale: Locale;
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
    acceptedLocale: documents[0]?.servedLocale ?? locale,
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
