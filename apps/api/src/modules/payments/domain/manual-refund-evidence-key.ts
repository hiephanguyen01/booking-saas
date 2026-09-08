const MANUAL_REFUND_EVIDENCE_ROOT = 'manual-refund-evidence';

export function manualRefundEvidenceKeyPrefix(tenantId: string, operationId: string): string {
  return `${MANUAL_REFUND_EVIDENCE_ROOT}/${tenantId}/${operationId}`;
}

export function isManualRefundEvidenceKey(
  tenantId: string,
  operationId: string,
  key: string,
): boolean {
  const prefix = `${manualRefundEvidenceKeyPrefix(tenantId, operationId)}/`;
  return key.startsWith(prefix) && !key.includes('..');
}
