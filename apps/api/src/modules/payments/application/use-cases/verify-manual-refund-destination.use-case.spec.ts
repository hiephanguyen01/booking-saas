import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_CHECKER_ID, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { ManualRefundAccountMismatch } from '../../domain/errors/manual-refund-errors';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { VerifyManualRefundDestinationUseCase } from './verify-manual-refund-destination.use-case';

describe('VerifyManualRefundDestinationUseCase', () => {
  it('CAS-verifies an unsupported lookup and audits without PII', async () => {
    const patches: unknown[] = []; const audits: unknown[] = [];
    const tenantDb = fakeTenantDb({ now: MANUAL_REFUND_NOW });
    const current = manualRefundOperation({ status: 'verification_required', verificationResult: 'unsupported', makerUserId: null, claimedAt: null });
    const useCase = new VerifyManualRefundDestinationUseCase(
      fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: (_tx, _tenant, _id, _status, _version, patch) => { patches.push(patch); return Promise.resolve({ ...current, ...patch, version: 4 }); } }),
      fakePort<IAuditWriter>({ write: (_tx, entry) => { audits.push(entry); return Promise.resolve(); } }), tenantDb.service,
    );
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, outcome: 'matched', note: 'Matched bank document' }, MANUAL_REFUND_CHECKER_ID);
    expect(patches[0]).toMatchObject({ status: 'ready_for_transfer', verificationMethod: 'manual', verifiedByUserId: MANUAL_REFUND_CHECKER_ID, readyAt: MANUAL_REFUND_NOW });
    expect(JSON.stringify(audits)).not.toContain('NGUYEN VAN AN');
  });

  it('cannot override a lookup mismatch', async () => {
    const current = manualRefundOperation({ status: 'correction_required', verificationResult: 'mismatch', makerUserId: null, claimedAt: null });
    const useCase = new VerifyManualRefundDestinationUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current) }), fakePort<IAuditWriter>({}), fakeTenantDb().service);
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, outcome: 'matched', note: 'Override mismatch' }, MANUAL_REFUND_CHECKER_ID)).rejects.toBeInstanceOf(ManualRefundAccountMismatch);
  });
});
