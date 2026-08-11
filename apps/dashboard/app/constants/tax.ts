import type { PartnerTaxStatus, TenantTaxCategory } from '@booking/contracts';

/** Short names for a partner's tax status. */
export const PARTNER_TAX_STATUS_LABELS: Record<PartnerTaxStatus, string> = {
  company_vat: 'Doanh nghiệp kê khai GTGT',
  household_declaring: 'Hộ kinh doanh kê khai',
  household_below_threshold: 'Hộ kinh doanh dưới ngưỡng pháp lý/năm',
  individual: 'Cá nhân không kinh doanh',
};

/**
 * What each choice actually costs the partner. Shown under the select because a
 * tenant picking from names alone cannot tell that two of these mean 0% and two
 * do not — and the wrong pick mis-taxes every booking.
 */
export const PARTNER_TAX_STATUS_HINTS: Record<PartnerTaxStatus, string> = {
  company_vat:
    'Phương pháp khấu trừ: 8% (10% từ 1/1/2027), theo nhóm thuế của loại dịch vụ. Đối tác tự kê khai và xuất hóa đơn.',
  household_declaring:
    'Phương pháp tỷ lệ trên doanh thu: GTGT 4% (5% từ 1/1/2027). Khi nền tảng thu tiền, NĐ 117 khấu trừ tại nguồn GTGT 5% + TNCN 2%; chênh lệch được xử lý khi quyết toán năm.',
  household_below_threshold:
    'Không chịu thuế GTGT do doanh thu dưới ngưỡng pháp lý hiện hành; giao dịch nền tảng thu tiền vẫn bị khấu trừ tạm GTGT 5% + TNCN 2% và được đối trừ/hoàn khi quyết toán.',
  individual:
    'Không tự tính GTGT trên giao dịch; nền tảng thu tiền vẫn khấu trừ GTGT 5% + TNCN 2% theo NĐ 117.',
};

/** Deduction-method categories a tenant may set on a listing type. */
export const TENANT_TAX_CATEGORY_LABELS: Record<TenantTaxCategory, string> = {
  standard: 'Phổ thông — 8% (10% từ 1/1/2027)',
  reduced_5: 'Ưu đãi 5%',
  exempt: 'Không chịu thuế GTGT',
  not_taxable: 'Không thuộc diện chịu thuế',
};
