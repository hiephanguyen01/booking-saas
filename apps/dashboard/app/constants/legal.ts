import type { LegalDocumentType, Locale } from '@booking/contracts';

// Tenant legal-document display constants (tenant "Pháp lý" tab + the
// partner/affiliate re-acceptance interstitial). Keyed from the shared
// `legalDocumentTypeSchema` enum so a new document type fails typecheck here
// instead of rendering blank.

export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentType, string> = {
  customer_terms: 'Điều khoản sử dụng (khách hàng)',
  privacy_policy: 'Chính sách bảo mật',
  partner_terms: 'Điều khoản đối tác',
  affiliate_terms: 'Điều khoản cộng tác viên',
};

/** Short description shown under the doc-type heading in the authoring tab. */
export const LEGAL_DOCUMENT_HINTS: Record<LegalDocumentType, string> = {
  customer_terms: 'Áp dụng cho khách hàng khi đặt chỗ trên storefront.',
  privacy_policy: 'Cách dữ liệu khách hàng và đối tác được thu thập, sử dụng.',
  partner_terms: 'Đối tác phải đồng ý trước khi đăng tin hoặc nhận đặt chỗ.',
  affiliate_terms: 'Cộng tác viên phải đồng ý trước khi tạo liên kết giới thiệu.',
};

/** Locale → Vietnamese prose name, for inline sentences about a translation. */
export const LOCALE_PROSE_LABEL: Record<Locale, string> = { vi: 'tiếng Việt', en: 'tiếng Anh' };
