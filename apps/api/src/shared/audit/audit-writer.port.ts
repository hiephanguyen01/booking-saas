import type { PrismaTx } from '../tenant-context/tenant-db.service';

export const AUDIT_WRITER = Symbol('AUDIT_WRITER');

/**
 * One append to the shared `audit_logs` trail (§14.4). The write runs inside the
 * same tx as the change it records. `tenantId` is null for platform-tier rows.
 */
export interface AuditEntry {
  tenantId: string | null;
  actorUserId: string | null;
  /** e.g. `role.created`, `payout.paid`, `listing.hidden`. */
  action: string;
  entityType: string;
  entityId: string | null;
  data?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * The single seam every module writes audit through — so there is exactly one
 * `audit_logs` insertion path in the codebase (no module hand-rolls `tx.auditLog`).
 */
export interface IAuditWriter {
  write(tx: PrismaTx, entry: AuditEntry): Promise<void>;
}
