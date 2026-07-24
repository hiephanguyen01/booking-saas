import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PartnerOnboardingProfileInput } from '@booking/contracts';
import {
  inferredPartnerName,
  partnerApplyPayloadFor,
  partnerRegistrationEntry,
  partnerSlugFor,
} from './partner-onboarding-domain.ts';

test('derives a readable placeholder name from email', () => {
  assert.equal(inferredPartnerName('nguyen.van-a@example.com'), 'nguyen van a');
  assert.equal(inferredPartnerName('@example.com'), '@example.com');
});

test('selects the correct onboarding entry for auth state and tenant membership', () => {
  assert.equal(partnerRegistrationEntry(null, 'tenant-1'), 'register');
  assert.equal(
    partnerRegistrationEntry(
      { info: { scopes: [{ scope: 'customer', tenantId: 'tenant-1' }] } },
      'tenant-1',
    ),
    'profile',
  );
  assert.equal(
    partnerRegistrationEntry(
      { info: { scopes: [{ scope: 'partner', tenantId: 'tenant-1' }] } },
      'tenant-1',
    ),
    'dashboard',
  );
});

test('creates deterministic tenant-safe partner slugs', () => {
  assert.equal(
    partnerSlugFor('Đối Tác Ánh Dương', '12345678-aaaa-bbbb-cccc-123456789012'),
    'doi-tac-anh-duong-12345678',
  );
});

test('maps company profile data to the partner application payload', () => {
  const input = {
    name: 'Ánh Dương',
    partnerType: 'company',
    companyName: 'Công ty Ánh Dương',
    businessRegistrationNo: '0312345678',
    representativeName: 'Nguyễn An',
    identityNumber: '079123456789',
    identityCardFrontUrl: 'https://cdn.invalid/id-front.jpg',
    identityCardBackUrl: 'https://cdn.invalid/id-back.jpg',
    businessLicenseFrontUrl: 'https://cdn.invalid/license-front.jpg',
    businessLicenseBackUrl: 'https://cdn.invalid/license-back.jpg',
    phone: '0900000000',
    provinceCode: '79',
    wardCode: '26734',
    address: '1 Nguyễn Huệ',
    bank: 'VCB',
    bankAccountNumber: '123456789',
    bankAccountHolder: 'NGUYEN AN',
    acceptedTerms: true,
  } as PartnerOnboardingProfileInput;

  const payload = partnerApplyPayloadFor(
    input,
    'tenant-1',
    '12345678-aaaa-bbbb-cccc-123456789012',
  );

  assert.equal(payload.tenantId, 'tenant-1');
  assert.equal(payload.slug, 'anh-duong-12345678');
  assert.equal(payload.businessInfo?.taxId, '0312345678');
  assert.equal(payload.contactInfo.provinceCode, '79');
  assert.equal(payload.payoutInfo?.accountNumber, '123456789');
});
