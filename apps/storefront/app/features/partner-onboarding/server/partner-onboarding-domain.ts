import type { PartnerOnboardingProfileInput } from '@booking/contracts';
import type { PartnerApplyPayload } from '~/features/partner-onboarding/server/partner.server';

interface PartnerAuthSnapshot {
  info: {
    scopes: Array<{ scope: string; tenantId: string | null }>;
  };
}

export type PartnerRegistrationEntry = 'register' | 'profile' | 'dashboard';

export function inferredPartnerName(email: string): string {
  const local = email
    .split('@')[0]
    ?.replace(/[._-]+/g, ' ')
    .trim();
  return local || email;
}

export function partnerRegistrationEntry(
  auth: PartnerAuthSnapshot | null | undefined,
  tenantId: string,
): PartnerRegistrationEntry {
  if (!auth) return 'register';
  const alreadyPartner = auth.info.scopes.some(
    (membership) => membership.scope === 'partner' && membership.tenantId === tenantId,
  );
  return alreadyPartner ? 'dashboard' : 'profile';
}

export function partnerSlugFor(name: string, userId: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'doi-tac'}-${userId.replace(/-/g, '').slice(0, 8)}`;
}

export function partnerApplyPayloadFor(
  value: PartnerOnboardingProfileInput,
  tenantId: string,
  userId: string,
): PartnerApplyPayload {
  const businessInfo: Record<string, unknown> = {
    representativeName: value.representativeName,
    identityNumber: value.identityNumber,
    identityCardFrontUrl: value.identityCardFrontUrl,
    identityCardBackUrl: value.identityCardBackUrl,
  };
  if (value.partnerType === 'company') {
    businessInfo.legalName = value.companyName;
    businessInfo.businessRegistrationNo = value.businessRegistrationNo;
    businessInfo.taxId = value.businessRegistrationNo;
    businessInfo.businessLicenseFrontUrl = value.businessLicenseFrontUrl;
    businessInfo.businessLicenseBackUrl = value.businessLicenseBackUrl;
  }
  return {
    tenantId,
    name: value.name,
    slug: partnerSlugFor(value.name, userId),
    partnerType: value.partnerType,
    businessInfo,
    contactInfo: {
      phone: value.phone,
      provinceCode: value.provinceCode,
      wardCode: value.wardCode,
      address: value.address,
    },
    payoutInfo: {
      bank: value.bank,
      accountNumber: value.bankAccountNumber,
      holderName: value.bankAccountHolder,
    },
  };
}
