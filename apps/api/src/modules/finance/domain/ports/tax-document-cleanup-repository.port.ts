import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const TAX_DOCUMENT_CLEANUP_REPOSITORY = Symbol('TAX_DOCUMENT_CLEANUP_REPOSITORY');

export interface TaxDocumentCleanupCandidate {
  id: string;
  tenantId: string;
}

export interface ITaxDocumentCleanupRepository {
  findCandidates(limit: number, now: Date): Promise<TaxDocumentCleanupCandidate[]>;
  claim(tx: PrismaTx, tenantId: string, id: string, now: Date): Promise<string | null>;
  markDeleted(tx: PrismaTx, tenantId: string, id: string, deletedAt: Date): Promise<void>;
}
