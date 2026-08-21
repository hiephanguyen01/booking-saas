import { readHttpUrl, readString } from '~/lib/records';

/**
 * Legal text fields read out of the partner's `businessInfo` jsonb, in display
 * order. Sensitive document images are intentionally excluded: callers must use
 * the permission-gated partner document descriptor endpoint instead.
 */
export const LEGAL_FIELD_LABELS: { label: string; key: string }[] = [
  { label: 'Tên pháp lý', key: 'legalName' },
  { label: 'Tên doanh nghiệp', key: 'companyName' },
  { label: 'Mã số thuế', key: 'taxId' },
  { label: 'Số giấy phép kinh doanh', key: 'businessRegistrationNo' },
  { label: 'Số giấy phép/chứng chỉ', key: 'licenseNo' },
];

export interface BusinessInfoView {
  /** Legal text fields, de-duplicated so the same value is never labelled twice. */
  legalDetails: { label: string; value: string }[];
  representativeName: string | null;
  /** Logo remains intentionally public storefront media. */
  logoUrl: string | null;
}

/** Narrows the partner's free-form `businessInfo` jsonb into a non-sensitive typed view. */
export function readBusinessInfo(raw: Record<string, unknown>): BusinessInfoView {
  const seenValues = new Set<string>();
  const legalDetails: { label: string; value: string }[] = [];
  for (const { label, key } of LEGAL_FIELD_LABELS) {
    const value = readString(raw[key]);
    if (value && !seenValues.has(value)) {
      seenValues.add(value);
      legalDetails.push({ label, value });
    }
  }

  return {
    legalDetails,
    representativeName: readString(raw.representativeName),
    logoUrl: readHttpUrl(raw.logoUrl),
  };
}
