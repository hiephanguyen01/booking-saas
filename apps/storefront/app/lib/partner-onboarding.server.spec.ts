import { describe, expect, it } from 'vitest';
import {
  partnerApplyPayloadFor,
  partnerRegistrationEntry,
  partnerSlugFor,
} from './partner-onboarding.server';

describe('partnerSlugFor', () => {
  it('normalizes Vietnamese names and adds a stable user suffix', () => {
    expect(partnerSlugFor('Studio Ánh Sáng Đẹp', '019f61bf-bd95-78d0-8e95-03732978ccf5')).toBe(
      'studio-anh-sang-dep-019f61bf',
    );
    expect(partnerSlugFor('Studio Ánh Sáng Đẹp', '019f61bf-bd95-78d0-8e95-03732978ccf5')).toBe(
      'studio-anh-sang-dep-019f61bf',
    );
  });
});

describe('partnerRegistrationEntry', () => {
  const tenantId = '019f61bf-bd95-78d0-8e95-03732978ccf5';

  it('starts account registration for a guest', () => {
    expect(partnerRegistrationEntry(null, tenantId)).toBe('register');
  });

  it('sends an authenticated customer directly to the profile step', () => {
    const auth = {
      info: { scopes: [] },
    } as unknown as Parameters<typeof partnerRegistrationEntry>[0];
    expect(partnerRegistrationEntry(auth, tenantId)).toBe('profile');
  });

  it('sends an existing partner in the current tenant to the dashboard', () => {
    const auth = {
      info: {
        scopes: [{ scope: 'partner', tenantId, partnerId: 'partner-id' }],
      },
    } as unknown as Parameters<typeof partnerRegistrationEntry>[0];
    expect(partnerRegistrationEntry(auth, tenantId)).toBe('dashboard');
  });
});

describe('partnerApplyPayloadFor', () => {
  it('maps legal documents, contact details, and payout details for the API', () => {
    const tenantId = '019f61bf-bd95-78d0-8e95-03732978ccf5';
    const userId = '019f61bf-bd95-78d0-8e95-03732978ccf6';
    const payload = partnerApplyPayloadFor(
      {
        name: 'Studio Ánh Sáng',
        partnerType: 'company',
        representativeName: 'Nguyễn Văn A',
        companyName: 'Công ty Ánh Sáng',
        businessRegistrationNo: 'GPKD-123',
        identityNumber: '079123456789',
        provinceCode: '79',
        wardCode: '26740',
        address: '12 Nguyễn Huệ',
        phone: '0901234567',
        bank: 'Vietcombank',
        bankAccountNumber: '0011223344',
        bankAccountHolder: 'NGUYEN VAN A',
        businessLicenseFrontUrl: 'https://cdn.example.com/business-front.png',
        businessLicenseBackUrl: 'https://cdn.example.com/business-back.png',
        identityCardFrontUrl: 'https://cdn.example.com/id-front.png',
        identityCardBackUrl: 'https://cdn.example.com/id-back.png',
        acceptedTerms: true,
      },
      tenantId,
      userId,
    );

    expect(payload).toEqual({
      tenantId,
      name: 'Studio Ánh Sáng',
      slug: 'studio-anh-sang-019f61bf',
      partnerType: 'company',
      businessInfo: {
        representativeName: 'Nguyễn Văn A',
        identityNumber: '079123456789',
        identityCardFrontUrl: 'https://cdn.example.com/id-front.png',
        identityCardBackUrl: 'https://cdn.example.com/id-back.png',
        legalName: 'Công ty Ánh Sáng',
        businessRegistrationNo: 'GPKD-123',
        taxId: 'GPKD-123',
        businessLicenseFrontUrl: 'https://cdn.example.com/business-front.png',
        businessLicenseBackUrl: 'https://cdn.example.com/business-back.png',
      },
      contactInfo: {
        phone: '0901234567',
        provinceCode: '79',
        wardCode: '26740',
        address: '12 Nguyễn Huệ',
      },
      payoutInfo: {
        bank: 'Vietcombank',
        accountNumber: '0011223344',
        holderName: 'NGUYEN VAN A',
      },
    });
  });
});
