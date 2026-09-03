import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { ManualRefundOperation } from '../../domain/entities/manual-refund-operation.entity';
import {
  ManualRefundAccountMismatch,
  ManualRefundMakerCannotApproveOwnTransfer,
} from '../../domain/errors/manual-refund-errors';
import type { ManualRefundPiiCryptoPort } from '../../domain/ports/manual-refund-pii-crypto.port';
import { ProtectManualRefundDestinationUseCase } from './protect-manual-refund-destination.use-case';

describe('ProtectManualRefundDestinationUseCase', () => {
  it('validates and trims the account number before passing it to the dedicated PII port', () => {
    const inputs: Array<Record<string, string>> = [];
    const useCase = new ProtectManualRefundDestinationUseCase(
      fakePort<ManualRefundPiiCryptoPort>({
        protectAccountNumber: (input) => {
          inputs.push(input);
          return {
            ciphertext: 'protected',
            keyVersion: 'v2',
            fingerprint: 'a'.repeat(64),
            last4: '4567',
          };
        },
      }),
    );

    const result = useCase.execute({
      tenantId: 'tenant-1',
      operationId: 'operation-1',
      bankCode: 'VCB',
      accountNumber: ' 0011001234567 ',
    });
    expect(result).toMatchObject({ keyVersion: 'v2', last4: '4567' });
    expect(inputs).toEqual([
      {
        tenantId: 'tenant-1',
        operationId: 'operation-1',
        bankCode: 'VCB',
        accountNumber: '0011001234567',
      },
    ]);
  });

  it('rejects a non-numeric account before invoking crypto', () => {
    const useCase = new ProtectManualRefundDestinationUseCase(
      fakePort<ManualRefundPiiCryptoPort>({}),
    );
    expect(() =>
      useCase.execute({
        tenantId: 'tenant-1',
        operationId: 'operation-1',
        bankCode: 'VCB',
        accountNumber: '0011-0012',
      }),
    ).toThrow('Receiving account number is invalid');
  });
});

describe('ManualRefundOperation policy', () => {
  it('requires independent maker and checker before completion', () => {
    const operation = ManualRefundOperation.rehydrate({
      id: 'operation-1',
      status: 'awaiting_details',
      version: 1,
      makerUserId: null,
    });

    operation.recordDestinationVerification('matched');
    operation.claim('maker-1');
    operation.submitTransfer('maker-1');
    expect(() => operation.approve('maker-1')).toThrow(ManualRefundMakerCannotApproveOwnTransfer);
    operation.approve('checker-1');

    expect(operation.snapshot()).toMatchObject({ status: 'completed', version: 5 });
  });

  it('makes a lookup mismatch non-overridable and sends unsupported lookup to manual verification', () => {
    const mismatch = ManualRefundOperation.rehydrate({
      id: 'operation-1',
      status: 'awaiting_details',
      version: 1,
      makerUserId: null,
    });
    mismatch.recordDestinationVerification('mismatch');
    expect(mismatch.snapshot().status).toBe('correction_required');
    expect(() => mismatch.verifyManually()).toThrow(ManualRefundAccountMismatch);

    const unsupported = ManualRefundOperation.rehydrate({
      id: 'operation-2',
      status: 'awaiting_details',
      version: 1,
      makerUserId: null,
    });
    unsupported.recordDestinationVerification('unsupported');
    expect(unsupported.snapshot().status).toBe('verification_required');
    unsupported.verifyManually();
    expect(unsupported.snapshot().status).toBe('ready_for_transfer');
  });
});
