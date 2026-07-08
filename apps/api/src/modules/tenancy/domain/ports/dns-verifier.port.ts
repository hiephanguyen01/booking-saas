export const DNS_VERIFIER = Symbol('DNS_VERIFIER');

/** Checks whether a domain has published the expected TXT verification record. */
export interface IDnsVerifier {
  hasTxtRecord(name: string, expectedValue: string): Promise<boolean>;
}
