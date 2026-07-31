import type { LegalDocumentType, Locale } from '@booking/contracts';
import { affiliateTermsTemplate } from './affiliate-terms.template';
import { customerTermsTemplate } from './customer-terms.template';
import { partnerTermsTemplate } from './partner-terms.template';
import { privacyPolicyTemplate } from './privacy-policy.template';

export interface LegalTemplateText {
  title: string;
  bodyMd: string;
}

/**
 * The starting draft text `seedDrafts` writes for a brand-new tenant, one per
 * required document type and locale. `{{tenantName}}` placeholders are
 * substituted at seed time — this is real starting prose a tenant edits, not a
 * stub.
 */
export const LEGAL_TEMPLATES: Record<LegalDocumentType, Record<Locale, LegalTemplateText>> = {
  customer_terms: customerTermsTemplate,
  privacy_policy: privacyPolicyTemplate,
  partner_terms: partnerTermsTemplate,
  affiliate_terms: affiliateTermsTemplate,
};
