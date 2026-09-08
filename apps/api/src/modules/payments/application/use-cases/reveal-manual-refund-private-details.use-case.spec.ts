import { describe, expect, it } from 'vitest';
import {
  fakePort,
  fakeTenantDb,
  MANUAL_REFUND_OPERATION_ID,
  MANUAL_REFUND_TENANT_ID,
  manualRefundOperation,
} from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import type { ManualRefundPiiCryptoPort } from '../../domain/ports/manual-refund-pii-crypto.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { ManualRefundOperationNotFound } from '../../domain/errors/manual-refund-errors';
import { RevealManualRefundPrivateDetailsUseCase } from './reveal-manual-refund-private-details.use-case';

describe('RevealManualRefundPrivateDetailsUseCase', () => {
  it('audits the reveal and returns plaintext plus a short-lived receipt URL without the object key', async () => {
    const audits: unknown[] = [];
    const decryptInputs: unknown[] = [];
    const evidenceObjectKey = `manual-refund-evidence/${MANUAL_REFUND_TENANT_ID}/${MANUAL_REFUND_OPERATION_ID}/receipt.pdf`;
    const current = manualRefundOperation({
      evidenceObjectKey,
      evidenceContentType: 'application/pdf',
      evidenceSizeBytes: 12,
      evidenceSha256: 'b'.repeat(64),
      evidenceVerifiedAt: new Date(),
    });
    const useCase = new RevealManualRefundPrivateDetailsUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }),
        findById: (_tx, tenantId, operationId) => {
          expect({ tenantId, operationId }).toEqual({
            tenantId: MANUAL_REFUND_TENANT_ID,
            operationId: MANUAL_REFUND_OPERATION_ID,
          });
          return Promise.resolve(current);
        },
      }),
      fakePort<ManualRefundPiiCryptoPort>({
        decryptAccountNumber: (input) => {
          decryptInputs.push(input);
          return '01234567';
        },
      }),
      fakePort<StoragePort>({
        createPrivatePresignedDownload: (input) => {
          expect(input).toEqual({ key: evidenceObjectKey });
          return Promise.resolve({
            downloadUrl: 'https://private.example/download',
            expiresInSec: 300,
          });
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      fakeTenantDb().service,
    );
    const result = await useCase.execute(
      MANUAL_REFUND_TENANT_ID,
      MANUAL_REFUND_OPERATION_ID,
      { reason: 'Prepare bank transfer' },
      { userId: 'actor-1', ip: '127.0.0.1' },
    );
    expect(result).toEqual({
      bankCode: 'VCB',
      accountName: 'NGUYEN VAN AN',
      accountNumber: '01234567',
      evidenceDownload: {
        downloadUrl: 'https://private.example/download',
        expiresInSec: 300,
      },
    });
    expect(JSON.stringify(result)).not.toContain('private/receipt.pdf');
    expect(decryptInputs).toEqual([
      {
        tenantId: MANUAL_REFUND_TENANT_ID,
        operationId: MANUAL_REFUND_OPERATION_ID,
        keyVersion: 'v1',
        ciphertext: 'secret-ciphertext',
      },
    ]);
    expect(audits[0]).toMatchObject({
      tenantId: MANUAL_REFUND_TENANT_ID,
      action: 'manual_refund.private_details_revealed',
      actorUserId: 'actor-1',
      ip: '127.0.0.1',
      data: { reason: 'Prepare bank transfer', evidencePresent: true },
    });
    expect(JSON.stringify(audits)).not.toContain('secret-ciphertext');
    expect(JSON.stringify(audits)).not.toContain('01234567');
    expect(JSON.stringify(audits)).not.toContain('a'.repeat(64));
  });

  it('does not decrypt or create a download before tenant-scoped operation authorization', async () => {
    let decrypted = false;
    const useCase = new RevealManualRefundPrivateDetailsUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }),
        findById: () => Promise.resolve(null),
      }),
      fakePort<ManualRefundPiiCryptoPort>({
        decryptAccountNumber: () => {
          decrypted = true;
          return '01234567';
        },
      }),
      fakePort<StoragePort>({}),
      fakePort<IAuditWriter>({}),
      fakeTenantDb().service,
    );

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        { reason: 'Prepare bank transfer' },
        { userId: 'actor-1', ip: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(ManualRefundOperationNotFound);
    expect(decrypted).toBe(false);
  });

  it('rejects with MANUAL_REFUND_WORKFLOW_PAUSED when workflow is paused without decrypting or auditing', async () => {
    let decrypted = false;
    const audits: unknown[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new RevealManualRefundPrivateDetailsUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: true }),
      }),
      fakePort<ManualRefundPiiCryptoPort>({
        decryptAccountNumber: () => {
          decrypted = true;
          return '01234567';
        },
      }),
      fakePort<StoragePort>({}),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    );

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        MANUAL_REFUND_OPERATION_ID,
        { reason: 'Prepare bank transfer' },
        { userId: 'actor-1', ip: '127.0.0.1' },
      ),
    ).rejects.toMatchObject({
      code: 'MANUAL_REFUND_WORKFLOW_PAUSED',
      status: 409,
    });
    expect(decrypted).toBe(false);
    expect(audits).toHaveLength(0);
  });
});

