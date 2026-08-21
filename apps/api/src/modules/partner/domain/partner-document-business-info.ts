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
