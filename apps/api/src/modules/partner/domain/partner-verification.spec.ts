import { describe, expect, it } from 'vitest';
import {
  ageInYears,
  canServeListingType,
  isAdult,
  nameMatches,
  normalizeName,
} from './partner-verification';

describe('partner-verification', () => {
  describe('ageInYears / isAdult', () => {
    const now = new Date('2026-07-09T00:00:00.000Z');

    it('treats exactly-18-today as an adult', () => {
      const dob = new Date('2008-07-09');
      expect(ageInYears(dob, now)).toBe(18);
      expect(isAdult(dob, now)).toBe(true);
    });

    it('treats one day short of 18 as a minor', () => {
      const dob = new Date('2008-07-10');
      expect(ageInYears(dob, now)).toBe(17);
      expect(isAdult(dob, now)).toBe(false);
    });

    it('handles a clearly adult DOB', () => {
      expect(isAdult(new Date('1990-01-01'), now)).toBe(true);
    });
  });

  describe('name matching', () => {
    it('normalizes diacritics, case, spacing and punctuation', () => {
      expect(normalizeName('Trần Thị Trang')).toBe('TRAN THI TRANG');
      expect(nameMatches('Trần Thị Trang', 'TRAN THI TRANG')).toBe(true);
      expect(nameMatches('nguyen  van-a', 'Nguyễn Văn A')).toBe(true);
    });

    it('rejects different names and empty input', () => {
      expect(nameMatches('Tran Thi Trang', 'Le Van B')).toBe(false);
      expect(nameMatches('', 'Anything')).toBe(false);
    });
  });

  describe('canServeListingType', () => {
    it('always allows a resource (non people-booking) type', () => {
      expect(
        canServeListingType({ verificationStatus: 'unsubmitted' }, { requiresIdentityVerification: false }),
      ).toBe(true);
    });

    it('requires a verified identity for a people-booking type', () => {
      const gate = { requiresIdentityVerification: true };
      expect(canServeListingType({ verificationStatus: 'verified' }, gate)).toBe(true);
      for (const status of ['unsubmitted', 'pending', 'rejected'] as const) {
        expect(canServeListingType({ verificationStatus: status }, gate)).toBe(false);
      }
    });
  });
});
