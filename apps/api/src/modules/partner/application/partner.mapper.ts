import {
  administrativeProvinceTypeSchema,
  administrativeWardTypeSchema,
  identityDocumentTypeSchema,
  type AdministrativeProvinceType,
  type AdministrativeWardType,
  type IdentityDocumentType,
  type PartnerContactInfoResponse,
  type PartnerIdentityInfoResponse,
  type PartnerResponse,
} from '@booking/contracts';
import type { PartnerRecord } from '../domain/ports/partner-repository.port';
import type { ZodSchema } from 'zod';

/**
 * `contact_info` / `identity_info` are jsonb: the column has no shape guarantee
 * (a house partner's is `{}`, and rows written before a key existed simply lack
 * it). Read every key defensively and normalise a missing/ill-typed value to
 * `null` rather than leaking `undefined` — the response contract promises the key
 * is present and nullable, so a consumer can render "—" without optional
 * chaining through the blob.
 */
function readString(blob: Record<string, unknown>, key: string): string | null {
  const value = blob[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Same as {@link readString} but keeps the value only if it is a live enum member. */
function readEnum<T extends string>(
  blob: Record<string, unknown>,
  key: string,
  schema: ZodSchema<T>,
): T | null {
  const parsed = schema.safeParse(blob[key]);
  return parsed.success ? parsed.data : null;
}

function toContactInfo(blob: Record<string, unknown>): PartnerContactInfoResponse {
  return {
    phone: readString(blob, 'phone'),
    provinceCode: readString(blob, 'provinceCode'),
    provinceName: readString(blob, 'provinceName'),
    provinceType: readEnum<AdministrativeProvinceType>(
      blob,
      'provinceType',
      administrativeProvinceTypeSchema,
    ),
    wardCode: readString(blob, 'wardCode'),
    wardName: readString(blob, 'wardName'),
    wardType: readEnum<AdministrativeWardType>(blob, 'wardType', administrativeWardTypeSchema),
    address: readString(blob, 'address'),
  };
}

function toIdentityInfo(blob: Record<string, unknown>): PartnerIdentityInfoResponse {
  return {
    documentType: readEnum<IdentityDocumentType>(blob, 'documentType', identityDocumentTypeSchema),
    documentNumber: readString(blob, 'documentNumber'),
    holderName: readString(blob, 'holderName'),
    reviewedBy: readString(blob, 'reviewedBy'),
    reviewNote: readString(blob, 'reviewNote'),
  };
}

/**
 * The single partner → wire mapping, shared by the tenant, partner and applicant
 * audiences. It is deliberately NOT audience-filtered: every route returning this
 * shape is already scoped to one partner the caller is entitled to (see
 * `partnerIdentityInfoResponseSchema`). If a public/marketplace partner route is
 * ever added, it must NOT reuse this mapper — `identityInfo` and `payoutInfo`
 * would leak.
 */
export function toPartnerResponse(p: PartnerRecord): PartnerResponse {
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    partnerType: p.partnerType,
    isHouse: p.isHouse,
    status: p.status,
    verificationStatus: p.verificationStatus,
    verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
    dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
    payoutInfo: p.payoutInfo,
    businessInfo: p.businessInfo,
    contactInfo: toContactInfo(p.contactInfo),
    identityInfo: toIdentityInfo(p.identityInfo),
    defaultCancellationPolicyId: p.defaultCancellationPolicyId,
    owner: p.owner ? { email: p.owner.email, phone: p.owner.phone } : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
