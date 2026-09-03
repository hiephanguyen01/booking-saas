/** Canonical form used by the tenant-scoped unique transfer-reference index. */
export function normalizeManualRefundTransferReference(reference: string): string {
  return reference.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}
