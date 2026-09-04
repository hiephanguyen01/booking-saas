import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_CHECKER_ID, MANUAL_REFUND_MAKER_ID, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import type { IManualRefundEvidenceRepository } from '../../domain/ports/manual-refund-evidence-repository.port';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import { ReopenManualRefundDestinationUseCase } from './reopen-manual-refund-destination.use-case';

describe('ReopenManualRefundDestinationUseCase', () => {
  it('invalidates the maker, transfer draft, and evidence through CAS', async () => {
    const patches: unknown[] = []; const current = manualRefundOperation({ status: 'transfer_rejected', transferReference: 'VCB-1', evidenceObjectKey: 'private/x.pdf', evidenceContentType: 'application/pdf', evidenceSizeBytes: 12, evidenceSha256: 'b'.repeat(64), evidenceVerifiedAt: MANUAL_REFUND_NOW, transferSubmittedByUserId: MANUAL_REFUND_MAKER_ID, transferSubmittedAt: MANUAL_REFUND_NOW });
    const invalidated: string[] = [];
    const useCase = new ReopenManualRefundDestinationUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: (_tx, _tenant, _id, _status, _version, patch) => { patches.push(patch); return Promise.resolve({ ...current, ...patch, version: 4 }); } }), fakePort<IManualRefundEvidenceRepository>({ invalidateUploads: () => Promise.resolve([current.evidenceObjectKey as string]) }), fakePort<StoragePort>({ quarantinePrivateObject: (key) => { invalidated.push(key); return Promise.resolve(); } }), fakePort<IAuditWriter>({ write: () => Promise.resolve() }), fakeTenantDb({ now: MANUAL_REFUND_NOW }).service);
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, reason: 'Customer must correct account' }, MANUAL_REFUND_CHECKER_ID);
    expect(patches[0]).toMatchObject({ status: 'awaiting_details', makerUserId: null, transferReference: null, evidenceObjectKey: null, evidenceVerifiedAt: null, reopenedByUserId: MANUAL_REFUND_CHECKER_ID, reopenReason: 'Customer must correct account' });
    expect(invalidated).toEqual(['private/x.pdf']);
  });

  it('returns the committed reopened projection when object quarantine is temporarily unavailable', async () => {
    const current = manualRefundOperation({ status: 'transfer_rejected', evidenceObjectKey: 'private/x.pdf' });
    const audits: unknown[] = [];
    const useCase = new ReopenManualRefundDestinationUseCase(
      fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: (_tx, _tenant, _id, _status, _version, patch) => Promise.resolve({ ...current, ...patch, version: 4 }) }),
      fakePort<IManualRefundEvidenceRepository>({ invalidateUploads: () => Promise.resolve(['private/x.pdf']) }),
      fakePort<StoragePort>({ quarantinePrivateObject: () => Promise.reject(new Error('storage unavailable')) }),
      fakePort<IAuditWriter>({ write: (_tx, entry) => { audits.push(entry); return Promise.resolve(); } }),
      fakeTenantDb({ now: MANUAL_REFUND_NOW }).service,
    );
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, reason: 'Retry destination' }, MANUAL_REFUND_CHECKER_ID)).resolves.toMatchObject({ status: 'awaiting_details', version: 4 });
    expect(audits).toContainEqual(expect.objectContaining({ action: 'manual_refund.evidence_quarantine_failed', data: { failedObjectCount: 1 } }));
    expect(JSON.stringify(audits)).not.toContain('private/x.pdf');
  });
});
