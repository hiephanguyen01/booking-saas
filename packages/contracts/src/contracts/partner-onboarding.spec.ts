import { describe, expect, it } from 'vitest';
import { partnerOnboardingProfileSchema } from './partner';

const base = {
  name: 'Studio Ánh Sáng',
  representativeName: 'Nguyễn Văn A',
  identityNumber: '079123456789',
  provinceCode: '79',
  wardCode: '26740',
  address: '12 Nguyễn Huệ',
  phone: '0901234567',
  bank: 'Vietcombank',
  bankAccountNumber: '0011223344',
  bankAccountHolder: 'NGUYEN VAN A',
  acceptedTerms: true,
};

describe('partnerOnboardingProfileSchema', () => {
  it('accepts an organization with required business documents', () => {
    expect(
      partnerOnboardingProfileSchema.safeParse({
        ...base,
        partnerType: 'company',
        companyName: 'Studio Ánh Sáng LLC',
        businessRegistrationNo: 'GPKD-123',
        businessLicenseFrontUrl: 'https://cdn.example.com/business-front.png',
        businessLicenseBackUrl: 'https://cdn.example.com/business-back.png',
        identityCardFrontUrl: 'https://cdn.example.com/id-front.png',
        identityCardBackUrl: 'https://cdn.example.com/id-back.png',
      }).success,
    ).toBe(true);
  });

  it('requires both national-ID previews for an individual', () => {
    const result = partnerOnboardingProfileSchema.safeParse({ ...base, partnerType: 'individual' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.identityCardFrontUrl).toBeDefined();
      expect(fields.identityCardBackUrl).toBeDefined();
    }
  });

  it('rejects document values that are not uploaded URLs', () => {
    const result = partnerOnboardingProfileSchema.safeParse({
      ...base,
      partnerType: 'individual',
      identityCardFrontUrl: 'front.png',
      identityCardBackUrl: 'back.png',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.identityCardFrontUrl).toBeDefined();
      expect(fields.identityCardBackUrl).toBeDefined();
    }
  });

  it('requires explicit agreement acceptance', () => {
    const result = partnerOnboardingProfileSchema.safeParse({
      ...base,
      partnerType: 'individual',
      identityCardFrontUrl: 'https://cdn.example.com/id-front.png',
      identityCardBackUrl: 'https://cdn.example.com/id-back.png',
      acceptedTerms: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.acceptedTerms).toBeDefined();
  });

  it('uses the new two-level address and drops legacy district input', () => {
    const result = partnerOnboardingProfileSchema.parse({
      ...base,
      district: 'Quận 1',
      partnerType: 'individual',
      identityCardFrontUrl: 'https://cdn.example.com/id-front.png',
      identityCardBackUrl: 'https://cdn.example.com/id-back.png',
    });

    expect(result.provinceCode).toBe('79');
    expect(result.wardCode).toBe('26740');
    expect(result).not.toHaveProperty('district');
  });
});
