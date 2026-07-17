import type { IdentityDocumentType } from '@booking/contracts';

// Partner-domain display constants (tenant + partner areas).

/** Partner legal-type → Vietnamese label. */
export const PARTNER_TYPE_LABEL: Record<string, string> = {
  individual: 'Cá nhân',
  company: 'Doanh nghiệp',
};

/** Identity document type → Vietnamese label (partner verification, §5.2). */
export const IDENTITY_DOCUMENT_LABEL: Record<IdentityDocumentType, string> = {
  national_id: 'CCCD / CMND',
  passport: 'Hộ chiếu',
  driver_license: 'Giấy phép lái xe',
};
