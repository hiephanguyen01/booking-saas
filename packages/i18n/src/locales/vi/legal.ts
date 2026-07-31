/**
 * Chrome copy for the tenant-legal-documents feature: consent-gate labels,
 * the public legal-document page, and `/account/terms`. Keys are shared 1:1
 * with `en/legal.ts` — `documentLabels`/`otherAgreementLabels` are keyed by
 * the backend's `LegalDocumentType`/agreement-type strings, not prose.
 *
 * Deliberately excluded: the "bản dịch chưa có" fallback notice shown when a
 * document falls back to the tenant's default locale. That notice always
 * reads in Vietnamese regardless of the visitor's UI locale — it describes
 * what language the content was actually served in, not chrome around it —
 * so it stays a fixed constant (`LEGAL_FALLBACK_NOTICE_VI` in
 * `apps/storefront/app/features/legal/lib/legal-copy.ts`) rather than a
 * per-locale key here, where an `en` value could be "corrected" to English.
 */
export const viLegal = {
  documentLabels: {
    customer_terms: 'Điều khoản sử dụng',
    privacy_policy: 'Chính sách bảo mật',
    partner_terms: 'Điều khoản đối tác',
    affiliate_terms: 'Điều khoản cộng tác viên',
  },
  otherAgreementLabels: {
    commission_schedule: 'Biểu phí hoa hồng',
    promo_funding: 'Tài trợ khuyến mãi',
  },
  /** Joins the last two links in `LegalDocumentLinks` ("A, B và C"). */
  linksJoiner: ' và ',
  registerConsent: 'Tôi đã đọc và đồng ý với Điều khoản sử dụng và Chính sách bảo mật.',
  partnerConsent:
    'Tôi đồng ý với Điều khoản đối tác, Điều khoản sử dụng và Chính sách bảo mật của {tenant}.',
  affiliateConsent:
    'Tôi đồng ý với Điều khoản cộng tác viên, Điều khoản sử dụng và Chính sách bảo mật của {tenant}.',
  checkoutNoticePrefix: 'Bằng việc đặt chỗ, bạn đồng ý với',
  readDocuments: 'Xem: ',
  versionLabel: 'Phiên bản {versionNo}',
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
} as const;
