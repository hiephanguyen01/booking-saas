import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_MAKER_ID, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation } from '~testing';
import { ManualRefundConcurrentUpdate } from '../../domain/errors/manual-refund-errors';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import type { IManualRefundEvidenceRepository } from '../../domain/ports/manual-refund-evidence-repository.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { CreateManualRefundEvidenceUploadUseCase } from './create-manual-refund-evidence-upload.use-case';

describe('CreateManualRefundEvidenceUploadUseCase', () => {
  it('registers a private write-once receipt grant scoped to the claimed operation', async () => {
    const grants: unknown[] = []; const records: unknown[] = [];
    const grant = { uploadUrl: 'https://private.example/put', key: `manual-refund-evidence/${MANUAL_REFUND_TENANT_ID}/${MANUAL_REFUND_OPERATION_ID}/receipt.pdf`, expiresInSec: 300 };
    const useCase = new CreateManualRefundEvidenceUploadUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(manualRefundOperation()) }), fakePort<IManualRefundEvidenceRepository>({ createUpload: (_tx, _tenant, data) => { records.push(data); return Promise.resolve({} as never); } }), fakePort<StoragePort>({ createPrivatePresignedUpload: (input) => { grants.push(input); return Promise.resolve(grant); } }), fakeTenantDb({ now: new Date('2026-09-04T13:00:00Z') }).service);
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, contentType: 'application/pdf', sizeBytes: 12_345, checksum: 'b'.repeat(64) }, MANUAL_REFUND_MAKER_ID)).resolves.toEqual(grant);
    expect(grants[0]).toMatchObject({ keyPrefix: `manual-refund-evidence/${MANUAL_REFUND_TENANT_ID}/${MANUAL_REFUND_OPERATION_ID}`, contentType: 'application/pdf', contentLength: 12_345, writeOnce: true });
    expect(records[0]).toMatchObject({ operationId: MANUAL_REFUND_OPERATION_ID, objectKey: grant.key, checksum: 'b'.repeat(64), expiresAt: new Date('2026-09-05T13:00:00Z') });
  });

  it('rejects a stale operation version with a named concurrency conflict', async () => {
    const useCase = new CreateManualRefundEvidenceUploadUseCase(
      fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(manualRefundOperation({ version: 4 })) }),
      fakePort<IManualRefundEvidenceRepository>({}),
      fakePort<StoragePort>({ createPrivatePresignedUpload: () => Promise.resolve({ uploadUrl: 'https://private.example/put', key: `manual-refund-evidence/${MANUAL_REFUND_TENANT_ID}/${MANUAL_REFUND_OPERATION_ID}/receipt.pdf`, expiresInSec: 300 }) }),
      fakeTenantDb().service,
    );
    await expect(useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, contentType: 'application/pdf', sizeBytes: 12, checksum: 'b'.repeat(64) }, MANUAL_REFUND_MAKER_ID)).rejects.toBeInstanceOf(ManualRefundConcurrentUpdate);
  });
});
