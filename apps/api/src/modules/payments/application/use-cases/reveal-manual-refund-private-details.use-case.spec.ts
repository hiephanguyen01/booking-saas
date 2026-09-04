import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import type { ManualRefundPiiCryptoPort } from '../../domain/ports/manual-refund-pii-crypto.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { RevealManualRefundPrivateDetailsUseCase } from './reveal-manual-refund-private-details.use-case';

describe('RevealManualRefundPrivateDetailsUseCase', () => {
  it('audits the reveal and returns plaintext plus a short-lived receipt URL without the object key', async () => {
    const audits: unknown[] = []; const current = manualRefundOperation({ evidenceObjectKey: 'private/receipt.pdf', evidenceContentType: 'application/pdf', evidenceSizeBytes: 12, evidenceSha256: 'b'.repeat(64), evidenceVerifiedAt: new Date() });
    const useCase = new RevealManualRefundPrivateDetailsUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current) }), fakePort<ManualRefundPiiCryptoPort>({ decryptAccountNumber: () => '01234567' }), fakePort<StoragePort>({ createPrivatePresignedDownload: () => Promise.resolve({ downloadUrl: 'https://private.example/download', expiresInSec: 300 }) }), fakePort<IAuditWriter>({ write: (_tx, entry) => { audits.push(entry); return Promise.resolve(); } }), fakeTenantDb().service);
    const result = await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { reason: 'Prepare bank transfer' }, { userId: 'actor-1', ip: '127.0.0.1' });
    expect(result).toEqual({ bankCode: 'VCB', accountName: 'NGUYEN VAN AN', accountNumber: '01234567', evidenceDownload: { downloadUrl: 'https://private.example/download', expiresInSec: 300 } });
    expect(JSON.stringify(result)).not.toContain('private/receipt.pdf');
    expect(audits[0]).toMatchObject({ action: 'manual_refund.private_details_revealed', actorUserId: 'actor-1', ip: '127.0.0.1', data: { reason: 'Prepare bank transfer', evidencePresent: true } });
  });
});
