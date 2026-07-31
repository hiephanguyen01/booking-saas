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
