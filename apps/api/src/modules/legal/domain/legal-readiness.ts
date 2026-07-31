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
