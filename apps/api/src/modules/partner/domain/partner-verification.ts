import type { PartnerVerificationStatus } from '@booking/contracts';

/** Whole years between a date of birth and `now` (UTC calendar). */
export function ageInYears(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/** The under-18 gate for people-booking listing types (§7.3). */
export function isAdult(dob: Date, now: Date): boolean {
  return ageInYears(dob, now) >= 18;
}

/** Uppercase + strip diacritics/punctuation so ID and payout names compare fairly. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Whether the ID-document holder name matches the payout account holder name. */
export function nameMatches(idHolderName: string, payoutHolderName: string): boolean {
  const a = normalizeName(idHolderName);
  const b = normalizeName(payoutHolderName);
  return a.length > 0 && a === b;
}

export interface VerificationView {
  verificationStatus: PartnerVerificationStatus;
}

export interface ListingTypeGate {
  requiresIdentityVerification: boolean;
}
