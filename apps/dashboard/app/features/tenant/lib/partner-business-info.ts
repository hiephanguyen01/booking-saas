import { readHttpUrl, readString } from '~/lib/records';

/**
 * Legal text fields read out of the partner's `businessInfo` jsonb, in display
 * order. Kept as data (not JSX) so the reader stays framework-free.
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
  logoUrl: string | null;
  /** Personal ID card scans (front/back). */
  identityPhotos: string[];
  /** Business-license scans + any extra license documents. */
  licensePhotos: string[];
}

/** Every valid `http(s)` URL found at `keys` in an untrusted jsonb record. */
export function collectUrls(raw: Record<string, unknown>, keys: string[]): string[] {
  const urls: string[] = [];
  for (const key of keys) {
    const url = readHttpUrl(raw[key]);
    if (url) urls.push(url);
  }
  return urls;
}

/** Narrows the partner's free-form `businessInfo` jsonb into a typed view. */
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

  const identityPhotos = collectUrls(raw, ['identityCardFrontUrl', 'identityCardBackUrl']);
  const licensePhotos = collectUrls(raw, ['businessLicenseFrontUrl', 'businessLicenseBackUrl']);
  if (Array.isArray(raw.licenseDocs)) {
    for (const value of raw.licenseDocs) {
      const url = readHttpUrl(value);
      if (url) licensePhotos.push(url);
    }
  }

  return {
    legalDetails,
    representativeName: readString(raw.representativeName),
    logoUrl: readHttpUrl(raw.logoUrl),
    identityPhotos,
    licensePhotos,
  };
}
