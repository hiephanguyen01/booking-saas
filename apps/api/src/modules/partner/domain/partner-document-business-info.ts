import type { PartnerDocumentKind } from '@booking/contracts';
import { InvalidPartnerDocumentReference } from './errors/partner-errors';
import {
  isApplicantDocumentKeyForUser,
  isPartnerDocumentKey,
} from './partner-document-key';

const LEGACY_SENSITIVE_FIELDS = [
  'identityCardFrontUrl',
  'identityCardBackUrl',
  'businessLicenseFrontUrl',
  'businessLicenseBackUrl',
  'licenseDocs',
] as const;

const APPLICANT_DOCUMENT_FIELDS = [
  'identityCardFrontKey',
  'identityCardBackKey',
  'businessLicenseFrontKey',
  'businessLicenseBackKey',
] as const;

const DOCUMENT_FIELD_KINDS = [
  ['identityCardFrontKey', 'identity_card_front'],
  ['identityCardBackKey', 'identity_card_back'],
  ['businessLicenseFrontKey', 'business_license_front'],
  ['businessLicenseBackKey', 'business_license_back'],
] as const satisfies readonly (readonly [string, PartnerDocumentKind])[];

const LEGACY_FIELD_KINDS = [
  ['identityCardFrontUrl', 'identity_card_front'],
  ['identityCardBackUrl', 'identity_card_back'],
  ['businessLicenseFrontUrl', 'business_license_front'],
  ['businessLicenseBackUrl', 'business_license_back'],
] as const satisfies readonly (readonly [string, PartnerDocumentKind])[];

export type PartnerDocumentReference =
  | { storage: 'private'; kind: PartnerDocumentKind; key: string }
  | { storage: 'legacy_public'; kind: PartnerDocumentKind; url: string };

export function assertApplicantDocumentReferences(
  userId: string,
  businessInfo: Record<string, unknown>,
): void {
  for (const field of LEGACY_SENSITIVE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(businessInfo, field)) {
      throw new InvalidPartnerDocumentReference();
    }
  }

  for (const field of APPLICANT_DOCUMENT_FIELDS) {
    const value = businessInfo[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !isApplicantDocumentKeyForUser(userId, value)) {
      throw new InvalidPartnerDocumentReference();
    }
  }

  const licenseDocumentKeys = businessInfo.licenseDocumentKeys;
  if (licenseDocumentKeys !== undefined) {
    if (
      !Array.isArray(licenseDocumentKeys) ||
      licenseDocumentKeys.some(
        (value) =>
          typeof value !== 'string' || !isApplicantDocumentKeyForUser(userId, value),
      )
    ) {
      throw new InvalidPartnerDocumentReference();
    }
  }
}

export function assertPartnerDocumentReferences(
  partnerId: string,
  keys: readonly string[],
): void {
  if (keys.some((key) => !isPartnerDocumentKey(partnerId, key))) {
    throw new InvalidPartnerDocumentReference();
  }
}

function isSafePrivatePartnerDocumentKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.startsWith('partner-documents/') &&
    !value.startsWith('/') &&
    !value.includes('..') &&
    !value.includes('\\')
  );
}

function isLegacyPublicUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function collectPartnerDocumentReferences(
  businessInfo: Record<string, unknown>,
): PartnerDocumentReference[] {
  const references: PartnerDocumentReference[] = [];

  for (const [field, kind] of DOCUMENT_FIELD_KINDS) {
    const key = businessInfo[field];
    if (isSafePrivatePartnerDocumentKey(key)) {
      references.push({ storage: 'private', kind, key });
    }
  }

  const licenseDocumentKeys = businessInfo.licenseDocumentKeys;
  if (Array.isArray(licenseDocumentKeys)) {
    for (const key of licenseDocumentKeys) {
      if (isSafePrivatePartnerDocumentKey(key)) {
        references.push({ storage: 'private', kind: 'license_document', key });
      }
    }
  }

  for (const [field, kind] of LEGACY_FIELD_KINDS) {
    const url = businessInfo[field];
    if (isLegacyPublicUrl(url)) {
      references.push({ storage: 'legacy_public', kind, url });
    }
  }

  const licenseDocs = businessInfo.licenseDocs;
  if (Array.isArray(licenseDocs)) {
    for (const url of licenseDocs) {
      if (isLegacyPublicUrl(url)) {
        references.push({ storage: 'legacy_public', kind: 'license_document', url });
      }
    }
  }

  return references;
}
