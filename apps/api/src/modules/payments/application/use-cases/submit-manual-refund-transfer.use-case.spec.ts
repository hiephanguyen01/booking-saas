import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_MAKER_ID, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation, manualRefundUpload } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import { ManualRefundEvidenceUploadInvalid } from '../../domain/errors/manual-refund-errors';
import type { IManualRefundEvidenceRepository } from '../../domain/ports/manual-refund-evidence-repository.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { SubmitManualRefundTransferUseCase } from './submit-manual-refund-transfer.use-case';

describe('SubmitManualRefundTransferUseCase', () => {
  it('MIME-checks and CAS-claims the private receipt before submitting the normalized reference', async () => {
    const patches: unknown[] = []; const claimed: unknown[] = []; const current = manualRefundOperation(); const upload = manualRefundUpload();
    const useCase = new SubmitManualRefundTransferUseCase(fakePort<IManualRefundOperationRepository>({ getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }), findById: () => Promise.resolve(current), casUpdate: (_tx, _tenant, _id, _status, _version, patch) => { patches.push(patch); return Promise.resolve({ ...current, ...patch, version: 4 }); } }), fakePort<IManualRefundEvidenceRepository>({ findUpload: () => Promise.resolve(upload), claimUpload: (...args) => { claimed.push(args.slice(1)); return Promise.resolve(true); } }), fakePort<StoragePort>({ inspectPrivateFile: () => Promise.resolve({ valid: true, checksum: upload.checksum, sizeBytes: upload.sizeBytes, contentType: upload.contentType }) }), fakePort<IAuditWriter>({ write: () => Promise.resolve() }), fakeTenantDb({ now: MANUAL_REFUND_NOW }).service);
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, reference: '  vcb   001  ', evidenceObjectKey: upload.objectKey }, MANUAL_REFUND_MAKER_ID);
    expect(claimed[0]).toEqual([MANUAL_REFUND_TENANT_ID, upload.id, MANUAL_REFUND_NOW]);
    expect(patches[0]).toMatchObject({ status: 'transfer_submitted', transferReference: 'vcb 001', evidenceObjectKey: upload.objectKey, evidenceSha256: upload.checksum, evidenceVerifiedAt: MANUAL_REFUND_NOW, transferSubmittedByUserId: MANUAL_REFUND_MAKER_ID });
  });

  it('quarantines bytes whose declared MIME does not match their signature', async () => {
    const quarantined: string[] = []; let dbQuarantined = false; const upload = manualRefundUpload();
    const useCase = new SubmitManualRefundTransferUseCase(fakePort<IManualRefundOperationRepository>({ getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }) }), fakePort<IManualRefundEvidenceRepository>({ findUpload: () => Promise.resolve(upload), quarantineUpload: () => { dbQuarantined = true; return Promise.resolve(true); } }), fakePort<StoragePort>({ inspectPrivateFile: () => Promise.resolve({ valid: false, reason: 'invalid_signature', checksum: upload.checksum, sizeBytes: upload.sizeBytes, contentType: upload.contentType }), quarantinePrivateObject: (key) => { quarantined.push(key); return Promise.resolve(); } }), fakePort<IAuditWriter>({}), fakeTenantDb({ now: MANUAL_REFUND_NOW }).service);
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, reference: 'VCB-001', evidenceObjectKey: upload.objectKey }, MANUAL_REFUND_MAKER_ID)).rejects.toBeInstanceOf(ManualRefundEvidenceUploadInvalid);
    expect(quarantined).toEqual([upload.objectKey]);
    expect(dbQuarantined).toBe(true);
  });

  it('quarantines an object whose streamed size exceeds the hard cap', async () => {
    const upload = manualRefundUpload(); const quarantined: string[] = [];
    const useCase = new SubmitManualRefundTransferUseCase(fakePort<IManualRefundOperationRepository>({ getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }) }), fakePort<IManualRefundEvidenceRepository>({ findUpload: () => Promise.resolve(upload), quarantineUpload: () => Promise.resolve(true) }), fakePort<StoragePort>({ inspectPrivateFile: () => Promise.resolve({ valid: false, reason: 'too_large', checksum: '', sizeBytes: 10 * 1024 * 1024 + 1, contentType: upload.contentType }), quarantinePrivateObject: (key) => { quarantined.push(key); return Promise.resolve(); } }), fakePort<IAuditWriter>({}), fakeTenantDb({ now: MANUAL_REFUND_NOW }).service);
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, reference: 'VCB-001', evidenceObjectKey: upload.objectKey }, MANUAL_REFUND_MAKER_ID)).rejects.toBeInstanceOf(ManualRefundEvidenceUploadInvalid);
    expect(quarantined).toEqual([upload.objectKey]);
  });

  it('rejects with MANUAL_REFUND_WORKFLOW_PAUSED when workflow is paused', async () => {
    const tenantDb = fakeTenantDb();
    const useCase = new SubmitManualRefundTransferUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: true }),
      }),
      fakePort<IManualRefundEvidenceRepository>({}),
      fakePort<StoragePort>({}),
      fakePort<IAuditWriter>({}),
      tenantDb.service,
    );

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        { expectedVersion: 3, reference: 'VCB-001', evidenceObjectKey: 'manual-refund-evidence/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/receipt.pdf' },
        MANUAL_REFUND_MAKER_ID,
      ),
    ).rejects.toMatchObject({
      code: 'MANUAL_REFUND_WORKFLOW_PAUSED',
      status: 409,
    });
  });
});

