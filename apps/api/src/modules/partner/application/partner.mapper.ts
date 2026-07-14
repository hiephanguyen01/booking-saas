import type { PartnerResponse } from '@booking/contracts';
import type { PartnerRecord } from '../domain/ports/partner-repository.port';

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
    createdAt: p.createdAt.toISOString(),
  };
}
