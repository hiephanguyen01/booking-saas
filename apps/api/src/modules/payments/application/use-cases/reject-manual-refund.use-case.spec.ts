import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_CHECKER_ID, MANUAL_REFUND_MAKER_ID, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { RejectManualRefundUseCase } from './reject-manual-refund.use-case';

describe('RejectManualRefundUseCase', () => {
  it('records an independent checker rejection through CAS', async () => {
    const patches: unknown[] = []; const current = manualRefundOperation({ status: 'transfer_submitted', transferReference: 'VCB-1', evidenceObjectKey: 'private/x.pdf', evidenceContentType: 'application/pdf', evidenceSizeBytes: 12, evidenceSha256: 'b'.repeat(64), evidenceVerifiedAt: MANUAL_REFUND_NOW, transferSubmittedByUserId: MANUAL_REFUND_MAKER_ID, transferSubmittedAt: MANUAL_REFUND_NOW });
    const useCase = new RejectManualRefundUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: (_tx, _tenant, _id, _status, _version, patch) => { patches.push(patch); return Promise.resolve({ ...current, ...patch, version: 4 }); } }), fakePort<IAuditWriter>({ write: () => Promise.resolve() }), fakeTenantDb({ now: MANUAL_REFUND_NOW }).service);
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, reason: 'Receipt is unreadable' }, MANUAL_REFUND_CHECKER_ID);
    expect(patches[0]).toMatchObject({ status: 'transfer_rejected', checkedByUserId: MANUAL_REFUND_CHECKER_ID, checkedAt: MANUAL_REFUND_NOW, rejectionReason: 'Receipt is unreadable' });
  });
});
