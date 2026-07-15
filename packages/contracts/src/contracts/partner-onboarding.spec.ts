import { describe, expect, it } from 'vitest';
import { partnerOnboardingProfileSchema } from './partner';

const base = {
  name: 'Studio Ánh Sáng',
  representativeName: 'Nguyễn Văn A',
  identityNumber: '079123456789',
  province: 'TP Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Bến Nghé',
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
        businessLicenseFront: 'front.png',
        businessLicenseBack: 'back.png',
      }).success,
    ).toBe(true);
  });

  it('requires both national-ID previews for an individual', () => {
    const result = partnerOnboardingProfileSchema.safeParse({ ...base, partnerType: 'individual' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.identityDocumentFront).toBeDefined();
      expect(fields.identityDocumentBack).toBeDefined();
    }
  });

  it('requires explicit agreement acceptance', () => {
    const result = partnerOnboardingProfileSchema.safeParse({
      ...base,
      partnerType: 'individual',
      identityDocumentFront: 'front.png',
      identityDocumentBack: 'back.png',
      acceptedTerms: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.acceptedTerms).toBeDefined();
  });
});
