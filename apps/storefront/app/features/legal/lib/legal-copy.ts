import type { LegalDocumentType } from '@booking/contracts';
import type { Locale } from '@booking/i18n';

/**
 * Bilingual copy owned by the `legal` feature and reused everywhere a consent
 * gate names a document or a legal page needs chrome text.
 *
 * `@booking/i18n` is the storefront's normal translation source, but its
 * locale bundles live in `packages/i18n` — out of scope for this change (see
 * the implementation report). Every string below is new copy introduced by
 * the tenant-legal-documents feature with nowhere existing to live, so it is
 * centralized here instead of hardcoded per call site. Anything that already
 * had an `@booking/i18n` key (for example the footer's existing "privacy"/
 * "terms" labels) keeps using `useTranslation` as before.
 */
export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentType, Record<Locale, string>> = {
  customer_terms: { vi: 'Điều khoản sử dụng', en: 'Terms of Service' },
  privacy_policy: { vi: 'Chính sách bảo mật', en: 'Privacy Policy' },
  partner_terms: { vi: 'Điều khoản đối tác', en: 'Partner Terms' },
  affiliate_terms: { vi: 'Điều khoản cộng tác viên', en: 'Affiliate Terms' },
};

/** The two agreement types `/me/legal/acceptances` can return that have no public document page. */
export const OTHER_AGREEMENT_LABELS: Record<'commission_schedule' | 'promo_funding', Record<Locale, string>> = {
  commission_schedule: { vi: 'Biểu phí hoa hồng', en: 'Commission Schedule' },
  promo_funding: { vi: 'Tài trợ khuyến mãi', en: 'Promotion Funding' },
};

/**
 * Mandated verbatim by the tenant-legal-documents spec: shown above a document
 * whenever the tenant has not translated it into the requested locale, in the
 * language actually served (Vietnamese) — not translated per requested locale.
 */
export const LEGAL_FALLBACK_NOTICE_VI =
  'Bản tiếng Anh chưa có. Đây là bản tiếng Việt đang có hiệu lực.';

export const LEGAL_COPY = {
  vi: {
    registerConsent: 'Tôi đã đọc và đồng ý với Điều khoản sử dụng và Chính sách bảo mật.',
    partnerConsent: (tenant: string) =>
      `Tôi đồng ý với Điều khoản đối tác, Điều khoản sử dụng và Chính sách bảo mật của ${tenant}.`,
    affiliateConsent: (tenant: string) =>
      `Tôi đồng ý với Điều khoản cộng tác viên, Điều khoản sử dụng và Chính sách bảo mật của ${tenant}.`,
    checkoutNoticePrefix: 'Bằng việc đặt chỗ, bạn đồng ý với',
    readDocuments: 'Xem: ',
    versionLabel: (versionNo: number) => `Phiên bản ${versionNo}`,
    effectiveFrom: 'Có hiệu lực từ',
    historicalNotice: 'Bạn đang xem một phiên bản cũ, đã hết hiệu lực.',
    viewCurrent: 'Xem phiên bản hiện hành',
    myAcceptancesTitle: 'Điều khoản đã đồng ý',
    myAcceptancesSubtitle: 'Danh sách tài liệu pháp lý bạn đã đồng ý, phiên bản và ngôn ngữ đã đọc.',
    myAcceptancesEmpty: 'Bạn chưa đồng ý với tài liệu pháp lý nào.',
    myAcceptancesLoadError: 'Không thể tải danh sách điều khoản đã đồng ý.',
    columnDocument: 'Tài liệu',
    columnVersion: 'Phiên bản',
    columnDate: 'Ngày đồng ý',
    columnLanguage: 'Ngôn ngữ đã đọc',
    languageVi: 'Tiếng Việt',
    languageEn: 'Tiếng Anh',
    languageUnknown: '—',
    viewText: 'Xem nội dung',
    notFoundTitle: 'Không tìm thấy tài liệu',
    notFoundBody: 'Tài liệu pháp lý này hiện không có sẵn.',
  },
  en: {
    registerConsent: 'I have read and agree to the Terms of Service and Privacy Policy.',
    partnerConsent: (tenant: string) =>
      `I agree to ${tenant}'s Partner Terms, Terms of Service, and Privacy Policy.`,
    affiliateConsent: (tenant: string) =>
      `I agree to ${tenant}'s Affiliate Terms, Terms of Service, and Privacy Policy.`,
    checkoutNoticePrefix: 'By placing this booking, you agree to the',
    readDocuments: 'Read: ',
    versionLabel: (versionNo: number) => `Version ${versionNo}`,
    effectiveFrom: 'Effective from',
    historicalNotice: 'You are viewing an older, superseded version.',
    viewCurrent: 'View the current version',
    myAcceptancesTitle: 'Accepted terms',
    myAcceptancesSubtitle: 'The legal documents you have accepted, their version and the language you read.',
    myAcceptancesEmpty: "You haven't accepted any legal documents yet.",
    myAcceptancesLoadError: 'Could not load your accepted terms.',
    columnDocument: 'Document',
    columnVersion: 'Version',
    columnDate: 'Accepted on',
    columnLanguage: 'Language read',
    languageVi: 'Vietnamese',
    languageEn: 'English',
    languageUnknown: '—',
    viewText: 'View text',
    notFoundTitle: 'Document not found',
    notFoundBody: 'This legal document is not currently available.',
  },
} as const;

export function agreementTypeLabel(
  agreementType:
    | LegalDocumentType
    | 'commission_schedule'
    | 'promo_funding',
  locale: Locale,
): string {
  if (agreementType in LEGAL_DOCUMENT_LABELS) {
    return LEGAL_DOCUMENT_LABELS[agreementType as LegalDocumentType][locale];
  }
  return OTHER_AGREEMENT_LABELS[agreementType as 'commission_schedule' | 'promo_funding'][locale];
}
