import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { ManualRefundOperation } from '../../domain/entities/manual-refund-operation.entity';
import {
  ManualRefundAccountMismatch,
  ManualRefundDestinationRequired,
  ManualRefundEvidenceRequired,
  ManualRefundFreshAuthenticationRequired,
  ManualRefundInvalidTransition,
  ManualRefundMakerCannotApproveOwnTransfer,
} from '../../domain/errors/manual-refund-errors';
import type { ManualRefundPiiCryptoPort } from '../../domain/ports/manual-refund-pii-crypto.port';
import { ProtectManualRefundDestinationUseCase } from './protect-manual-refund-destination.use-case';

const OCCURRED_AT = new Date('2026-09-04T13:00:00.000Z');

function operationState(
  overrides: Record<string, unknown> = {},
): Parameters<typeof ManualRefundOperation.rehydrate>[0] {
  return {
    id: 'operation-1',
    status: 'ready_for_transfer',
    version: 1,
    destinationSubmittedAt: new Date('2026-09-04T12:00:00.000Z'),
    makerUserId: 'maker-1',
    claimedAt: new Date('2026-09-04T12:15:00.000Z'),
    transferReference: 'RF-2026-0001',
    evidenceObjectKey: 'manual-refunds/operation-1/receipt.pdf',
    evidenceContentType: 'application/pdf',
    evidenceSizeBytes: 1024,
    evidenceSha256: 'a'.repeat(64),
    evidenceVerifiedAt: new Date('2026-09-04T12:30:00.000Z'),
    transferSubmittedByUserId: null,
    transferSubmittedAt: null,
    reassignedByUserId: null,
    reassignmentReason: null,
    reassignedAt: null,
    reopenedByUserId: null,
    reopenReason: null,
    reopenedAt: null,
    breakGlassByUserId: null,
    breakGlassReason: null,
    breakGlassAuthenticatedAt: null,
    breakGlassAt: null,
    ...overrides,
  } as Parameters<typeof ManualRefundOperation.rehydrate>[0];
}

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
    const operation = ManualRefundOperation.rehydrate(
      operationState({ status: 'awaiting_details', makerUserId: null, claimedAt: null }),
    );

    operation.recordDestinationVerification('matched');
    operation.claim('maker-1');
    operation.submitTransfer('maker-1');
    expect(() => operation.approve('maker-1')).toThrow(ManualRefundMakerCannotApproveOwnTransfer);
    operation.approve('checker-1');

    expect(operation.snapshot()).toMatchObject({ status: 'completed', version: 5 });
  });

  it('makes a lookup mismatch non-overridable and sends unsupported lookup to manual verification', () => {
    const mismatch = ManualRefundOperation.rehydrate(
      operationState({ status: 'awaiting_details', makerUserId: null, claimedAt: null }),
    );
    mismatch.recordDestinationVerification('mismatch');
    expect(mismatch.snapshot().status).toBe('correction_required');
    expect(() => mismatch.verifyManually()).toThrow(ManualRefundAccountMismatch);

    const unsupported = ManualRefundOperation.rehydrate(
      operationState({
        id: 'operation-2',
        status: 'awaiting_details',
        makerUserId: null,
        claimedAt: null,
      }),
    );
    unsupported.recordDestinationVerification('unsupported');
    expect(unsupported.snapshot().status).toBe('verification_required');
    unsupported.verifyManually();
    expect(unsupported.snapshot().status).toBe('ready_for_transfer');
  });

  it('records who reassigned a claimed operation and why', () => {
    const operation = ManualRefundOperation.rehydrate(operationState());

    operation.reassign({
      makerUserId: 'maker-2',
      actorUserId: 'checker-1',
      reason: 'Maker shift ended',
      occurredAt: OCCURRED_AT,
    });

    expect(operation.snapshot()).toMatchObject({
      makerUserId: 'maker-2',
      reassignedByUserId: 'checker-1',
      reassignmentReason: 'Maker shift ended',
      reassignedAt: OCCURRED_AT,
      version: 2,
    });
  });

  it('requires rejection before reopening a submitted transfer', () => {
    const operation = ManualRefundOperation.rehydrate(
      operationState({
        status: 'transfer_submitted',
        transferSubmittedByUserId: 'maker-1',
        transferSubmittedAt: OCCURRED_AT,
      }),
    );

    expect(() =>
      operation.reopen({
        actorUserId: 'checker-1',
        reason: 'Customer requested a corrected destination',
        occurredAt: OCCURRED_AT,
      }),
    ).toThrow(ManualRefundInvalidTransition);
  });

  it('invalidates transfer evidence and preserves reopen actor and reason', () => {
    const operation = ManualRefundOperation.rehydrate(
      operationState({
        status: 'transfer_rejected',
        transferSubmittedByUserId: 'maker-1',
        transferSubmittedAt: new Date('2026-09-04T12:45:00.000Z'),
      }),
    );

    operation.reopen({
      actorUserId: 'checker-1',
      reason: 'Customer requested a corrected destination',
      occurredAt: OCCURRED_AT,
    });

    expect(operation.snapshot()).toMatchObject({
      status: 'awaiting_details',
      makerUserId: null,
      claimedAt: null,
      transferReference: null,
      evidenceObjectKey: null,
      evidenceVerifiedAt: null,
      transferSubmittedByUserId: null,
      transferSubmittedAt: null,
      reopenedByUserId: 'checker-1',
      reopenReason: 'Customer requested a corrected destination',
      reopenedAt: OCCURRED_AT,
      version: 2,
    });
  });

  it('does not let break-glass skip the submitted-transfer state', () => {
    const operation = ManualRefundOperation.rehydrate(operationState());

    expect(() =>
      operation.completeWithBreakGlass({
        actorUserId: 'platform-admin-1',
        reason: 'Approved emergency recovery',
        freshAuthenticationAt: new Date('2026-09-04T12:58:00.000Z'),
        occurredAt: OCCURRED_AT,
      }),
    ).toThrow(ManualRefundInvalidTransition);
  });

  it('requires verified evidence and fresh authentication for break-glass', () => {
    const withoutEvidence = ManualRefundOperation.rehydrate(
      operationState({
        status: 'transfer_submitted',
        evidenceObjectKey: null,
        evidenceVerifiedAt: null,
        transferSubmittedByUserId: 'maker-1',
        transferSubmittedAt: OCCURRED_AT,
      }),
    );
    const input = {
      actorUserId: 'platform-admin-1',
      reason: 'Approved emergency recovery',
      freshAuthenticationAt: new Date('2026-09-04T12:58:00.000Z'),
      occurredAt: OCCURRED_AT,
    };
    expect(() => withoutEvidence.completeWithBreakGlass(input)).toThrow(
      ManualRefundEvidenceRequired,
    );

    const staleAuthentication = ManualRefundOperation.rehydrate(
      operationState({
        status: 'transfer_submitted',
        transferSubmittedByUserId: 'maker-1',
        transferSubmittedAt: OCCURRED_AT,
      }),
    );
    expect(() =>
      staleAuthentication.completeWithBreakGlass({
        ...input,
        freshAuthenticationAt: new Date('2026-09-04T12:00:00.000Z'),
      }),
    ).toThrow(ManualRefundFreshAuthenticationRequired);
  });

  it('blocks transfer submission until destination and evidence are ready', () => {
    const withoutDestination = ManualRefundOperation.rehydrate(
      operationState({ destinationSubmittedAt: null }),
    );
    expect(() => withoutDestination.submitTransfer('maker-1')).toThrow(
      ManualRefundDestinationRequired,
    );

    const withoutEvidence = ManualRefundOperation.rehydrate(
      operationState({ evidenceObjectKey: null, evidenceVerifiedAt: null }),
    );
    expect(() => withoutEvidence.submitTransfer('maker-1')).toThrow(ManualRefundEvidenceRequired);
  });

  it('records non-PII break-glass metadata and keeps maker-checker separation', () => {
    const sameMaker = ManualRefundOperation.rehydrate(
      operationState({
        status: 'transfer_submitted',
        transferSubmittedByUserId: 'maker-1',
        transferSubmittedAt: OCCURRED_AT,
      }),
    );
    const input = {
      actorUserId: 'platform-admin-1',
      reason: 'Approved emergency recovery',
      freshAuthenticationAt: new Date('2026-09-04T12:58:00.000Z'),
      occurredAt: OCCURRED_AT,
    };
    expect(() => sameMaker.completeWithBreakGlass({ ...input, actorUserId: 'maker-1' })).toThrow(
      ManualRefundMakerCannotApproveOwnTransfer,
    );

    const operation = ManualRefundOperation.rehydrate(
      operationState({
        status: 'transfer_submitted',
        transferSubmittedByUserId: 'maker-1',
        transferSubmittedAt: OCCURRED_AT,
      }),
    );
    operation.completeWithBreakGlass(input);
    expect(operation.snapshot()).toMatchObject({
      status: 'completed',
      breakGlassByUserId: 'platform-admin-1',
      breakGlassReason: 'Approved emergency recovery',
      breakGlassAuthenticatedAt: new Date('2026-09-04T12:58:00.000Z'),
      breakGlassAt: OCCURRED_AT,
      version: 2,
    });
  });
});
