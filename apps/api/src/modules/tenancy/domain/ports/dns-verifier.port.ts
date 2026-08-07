export const DNS_VERIFIER = Symbol('DNS_VERIFIER');

/** Reads the public DNS a tenant controls: ownership proof, then where it points. */
export interface IDnsVerifier {
  /** Whether the domain has published the expected TXT verification record. */
  hasTxtRecord(name: string, expectedValue: string): Promise<boolean>;
  /** The CNAME target the hostname carries, lowercased without the FQDN dot; null when it has none. */
  resolveCname(hostname: string): Promise<string | null>;
  /** Every A record the hostname resolves to (a CNAME chain is followed); empty when none. */
  resolveIpv4(hostname: string): Promise<string[]>;
}
