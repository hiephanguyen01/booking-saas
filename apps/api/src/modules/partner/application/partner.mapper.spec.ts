import { partnerResponseSchema } from '@booking/contracts';
import { describe, expect, it } from 'vitest';
import { toPartnerResponse } from './partner.mapper';
import type { PartnerRecord } from '../domain/ports/partner-repository.port';

const base: PartnerRecord = {
  id: '22222222-2222-2222-2222-222222222222',
  tenantId: '11111111-1111-1111-1111-111111111111',
  name: 'Studio X',
  slug: 'studio-x',
  description: null,
  partnerType: 'individual',
  isHouse: false,
  status: 'pending',
  verificationStatus: 'unsubmitted',
  verifiedAt: null,
  dateOfBirth: null,
  payoutInfo: {},
  businessInfo: {},
  contactInfo: {},
  identityInfo: {},
  owner: null,
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  updatedAt: new Date('2026-02-03T04:05:06.000Z'),
};

describe('toPartnerResponse', () => {
  it('passes through a fully-populated contact + identity snapshot', () => {
    const response = toPartnerResponse({
      ...base,
      contactInfo: {
        phone: '0912345678',
        provinceCode: '01',
        provinceName: 'Thành phố Hà Nội',
        provinceType: 'municipality',
        wardCode: '00001',
        wardName: 'Phường Ba Đình',
        wardType: 'ward',
        address: 'Số 1 Đường Láng',
      },
      identityInfo: {
        documentType: 'national_id',
        documentNumber: '001199001234',
        holderName: 'Nguyễn Văn A',
        reviewedBy: '33333333-3333-3333-3333-333333333333',
        reviewNote: 'NAME_MISMATCH',
      },
      owner: { email: 'owner@studio-x.test', phone: '0987654321' },
    });

    expect(partnerResponseSchema.safeParse(response).success).toBe(true);
    expect(response.contactInfo.wardName).toBe('Phường Ba Đình');
    expect(response.owner).toEqual({ email: 'owner@studio-x.test', phone: '0987654321' });
    // The rejection reason must reach the rejected partner — that is the point.
    expect(response.identityInfo.reviewNote).toBe('NAME_MISMATCH');
    expect(response.updatedAt).toBe('2026-02-03T04:05:06.000Z');
  });

  it('nulls every key of an empty jsonb blob (a house partner never applied)', () => {
    const response = toPartnerResponse({ ...base, isHouse: true });

    expect(partnerResponseSchema.safeParse(response).success).toBe(true);
    expect(response.contactInfo).toEqual({
      phone: null,
      provinceCode: null,
      provinceName: null,
      provinceType: null,
      wardCode: null,
      wardName: null,
      wardType: null,
      address: null,
    });
    expect(response.identityInfo).toEqual({
      documentType: null,
      documentNumber: null,
      holderName: null,
      reviewedBy: null,
      reviewNote: null,
    });
    expect(response.owner).toBeNull();
  });

  it('drops jsonb values that are ill-typed rather than emitting them', () => {
    // jsonb has no shape guarantee: an unknown enum member or a non-string must
    // not escape into a response the contract says is `enum | null`.
    const response = toPartnerResponse({
      ...base,
      contactInfo: { phone: 12345, provinceType: 'city', address: '' },
      identityInfo: { documentType: 'retina_scan', documentNumber: null },
    });

    expect(partnerResponseSchema.safeParse(response).success).toBe(true);
    expect(response.contactInfo.phone).toBeNull();
    expect(response.contactInfo.provinceType).toBeNull();
    expect(response.contactInfo.address).toBeNull();
    expect(response.identityInfo.documentType).toBeNull();
    expect(response.identityInfo.documentNumber).toBeNull();
  });
});
