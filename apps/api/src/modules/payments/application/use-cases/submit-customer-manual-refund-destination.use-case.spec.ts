import type { SubmitManualRefundDestinationInput } from '@booking/contracts';
import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  ManualRefundConcurrentUpdate,
  ManualRefundDestinationLocked,
  ManualRefundThirdPartyConsentRequired,
} from '../../domain/errors/manual-refund-errors';
import type {
  AccountNameLookupPort,
  AccountNameLookupResponse,
} from '../../domain/ports/account-name-lookup.port';
import type {
  IManualRefundOperationRepository,
  ManualRefundOperationPatch,
  ManualRefundOperationRecord,
} from '../../domain/ports/manual-refund-operation-repository.port';
import type { ManualRefundPiiCryptoPort } from '../../domain/ports/manual-refund-pii-crypto.port';
import type {
  IRefundBatchRepository,
  RefundBatchRecord,
} from '../../domain/ports/refund-batch-repository.port';
import { ProtectManualRefundDestinationUseCase } from './protect-manual-refund-destination.use-case';
import { SubmitCustomerManualRefundDestinationUseCase } from './submit-customer-manual-refund-destination.use-case';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const BATCH_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-09-04T10:00:00.000Z');

function operation(
  overrides: Partial<ManualRefundOperationRecord> = {},
): ManualRefundOperationRecord {
  return {
    id: OPERATION_ID,
    tenantId: TENANT_ID,
    refundBatchId: BATCH_ID,
    status: 'awaiting_details',
    version: 2,
    destinationBankCode: null,
    destinationAccountName: null,
    destinationAccountLast4: null,
    destinationAccountCiphertext: null,
    destinationEncryptionKeyVersion: null,
    destinationAccountFingerprint: null,
    destinationIsThirdParty: false,
    destinationConsentAt: null,
    destinationSubmittedAt: null,
    verificationResult: null,
    verificationMethod: null,
    verifiedByUserId: null,
    verifiedAt: null,
    makerUserId: null,
    claimedAt: null,
    reassignedByUserId: null,
    reassignmentReason: null,
    reassignedAt: null,
    transferReference: null,
    transferReferenceNormalized: null,
    evidenceObjectKey: null,
    evidenceContentType: null,
    evidenceSizeBytes: null,
    evidenceSha256: null,
    evidenceVerifiedAt: null,
    transferSubmittedByUserId: null,
    transferSubmittedAt: null,
    checkedByUserId: null,
    checkedAt: null,
    rejectionReason: null,
    reopenedByUserId: null,
    reopenReason: null,
    reopenedAt: null,
    readyAt: null,
    transferDueAt: null,
    completedAt: null,
    customerAcknowledgement: null,
    customerAcknowledgedAt: null,
    customerAcknowledgementNote: null,
    ciphertextPurgedAt: null,
    breakGlassByUserId: null,
    breakGlassReason: null,
    breakGlassAuthenticatedAt: null,
    breakGlassAt: null,
    createdAt: new Date('2026-09-04T08:00:00.000Z'),
    updatedAt: new Date('2026-09-04T08:00:00.000Z'),
    ...overrides,
  };
}

const batch: RefundBatchRecord = {
  id: BATCH_ID,
  tenantId: TENANT_ID,
  bookingId: BOOKING_ID,
  requestedAmount: 1250000n,
  reason: 'booking_cancellation',
  affectsBookingStatus: true,
  status: 'manual_required',
  completedAt: null,
};

const input: SubmitManualRefundDestinationInput = {
  bankCode: 'VCB',
  accountNumber: '0011001234567',
  accountName: 'NGUYEN VAN AN',
  isThirdParty: false,
  thirdPartyConsent: false,
  expectedVersion: 2,
};

interface HarnessOptions {
  record?: ManualRefundOperationRecord;
  casMiss?: boolean;
  lookupResponse?: AccountNameLookupResponse;
}

function harness(options: HarnessOptions = {}) {
  const cryptoInputs: unknown[] = [];
  const lookupInputs: unknown[] = [];
  const patches: ManualRefundOperationPatch[] = [];
  const tenantDb = fakeTenantDb({ now: NOW });
  const current = options.record ?? operation();
  const crypto = new ProtectManualRefundDestinationUseCase(
    fakePort<ManualRefundPiiCryptoPort>({
      protectAccountNumber: (value) => {
        cryptoInputs.push(value);
        return {
          ciphertext: 'safe-ciphertext',
          keyVersion: 'v7',
          fingerprint: 'safe-fingerprint',
          last4: '4567',
        };
      },
    }),
  );
  const operations = fakePort<IManualRefundOperationRepository>({
    findById: () => Promise.resolve(current),
    casUpdate: (_tx, _tenantId, _id, _status, _version, patch) => {
      patches.push(patch);
      if (options.casMiss) return Promise.resolve(null);
      return Promise.resolve({
        ...current,
        ...patch,
        status: patch.status ?? current.status,
        version: current.version + 1,
        updatedAt: NOW,
      });
    },
  });
  const accountNameLookup = fakePort<AccountNameLookupPort>({
    lookup: (value) => {
      lookupInputs.push(value);
      return Promise.resolve(options.lookupResponse ?? { status: 'unsupported' });
    },
  });
  const useCase = new SubmitCustomerManualRefundDestinationUseCase(
    operations,
    fakePort<IRefundBatchRepository>({ findById: () => Promise.resolve(batch) }),
    accountNameLookup,
    crypto,
    tenantDb.service,
  );
  return { useCase, tenantDb, cryptoInputs, lookupInputs, patches };
}

describe('SubmitCustomerManualRefundDestinationUseCase', () => {
  it('protects the account and requires manual verification without exposing protected fields', async () => {
    const { useCase, tenantDb, cryptoInputs, lookupInputs, patches } = harness();

    const result = await useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, input, {
      thirdPartyOtpConsentVerified: false,
    });

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(tenantDb.clockReads()).toBe(1);
    expect(cryptoInputs).toEqual([
      {
        tenantId: TENANT_ID,
        operationId: OPERATION_ID,
        bankCode: 'VCB',
        accountNumber: '0011001234567',
      },
    ]);
    expect(lookupInputs).toEqual([
      {
        bankCode: 'VCB',
        accountNumber: '0011001234567',
        expectedAccountName: 'NGUYEN VAN AN',
      },
    ]);
    expect(patches).toEqual([
      expect.objectContaining({
        destinationBankCode: 'VCB',
        destinationAccountName: 'NGUYEN VAN AN',
        destinationAccountLast4: '4567',
        destinationAccountCiphertext: 'safe-ciphertext',
        destinationEncryptionKeyVersion: 'v7',
        destinationAccountFingerprint: 'safe-fingerprint',
        destinationSubmittedAt: NOW,
        verificationResult: 'unsupported',
        verificationMethod: null,
        verifiedAt: null,
        readyAt: null,
      }),
    ]);
    expect(result.status).toBe('verification_required');
    expect(result.destination).toEqual({
      bankCode: 'VCB',
      accountNameMasked: 'N••••• V•• A•',
      accountNumberLast4: '4567',
      isThirdParty: false,
      consentRecordedAt: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/safe-ciphertext|safe-fingerprint|0011001234567/);
  });

  it('advances a provider-matched destination directly to ready for transfer', async () => {
    const { useCase, patches } = harness({
      lookupResponse: { status: 'matched', registeredName: 'NGUYEN VAN AN' },
    });

    const result = await useCase.execute(
      TENANT_ID,
      BOOKING_ID,
      'BK-0001',
      OPERATION_ID,
      input,
      { thirdPartyOtpConsentVerified: false },
    );

    expect(patches).toEqual([
      expect.objectContaining({
        status: 'ready_for_transfer',
        verificationResult: 'matched',
        verificationMethod: 'lookup',
        verifiedAt: NOW,
        readyAt: NOW,
      }),
    ]);
    expect(result.status).toBe('ready_for_transfer');
    expect(result.verificationResult).toBe('matched');
  });

  it('blocks a provider-mismatched destination in correction required', async () => {
    const { useCase, patches } = harness({
      lookupResponse: { status: 'mismatch', registeredName: 'TRAN VAN B' },
    });

    const result = await useCase.execute(
      TENANT_ID,
      BOOKING_ID,
      'BK-0001',
      OPERATION_ID,
      input,
      { thirdPartyOtpConsentVerified: false },
    );

    expect(patches).toEqual([
      expect.objectContaining({
        status: 'correction_required',
        verificationResult: 'mismatch',
        verificationMethod: 'lookup',
        verifiedAt: NOW,
        readyAt: null,
      }),
    ]);
    expect(result.status).toBe('correction_required');
    expect(result.verificationResult).toBe('mismatch');
  });

  it('falls back to manual verification when the lookup provider errors', async () => {
    const { useCase, patches } = harness({
      lookupResponse: { status: 'error', retryable: true },
    });

    const result = await useCase.execute(
      TENANT_ID,
      BOOKING_ID,
      'BK-0001',
      OPERATION_ID,
      input,
      { thirdPartyOtpConsentVerified: false },
    );

    expect(patches).toEqual([
      expect.objectContaining({
        status: 'verification_required',
        verificationResult: 'error',
        verificationMethod: 'lookup',
        verifiedAt: null,
        readyAt: null,
      }),
    ]);
    expect(result.status).toBe('verification_required');
    expect(result.verificationResult).toBe('error');
  });

  it('requires OTP-backed grant consent for a third-party destination and records DB time', async () => {
    const denied = harness();
    const thirdPartyInput = { ...input, isThirdParty: true, thirdPartyConsent: true };
    await expect(
      denied.useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, thirdPartyInput, {
        thirdPartyOtpConsentVerified: false,
      }),
    ).rejects.toBeInstanceOf(ManualRefundThirdPartyConsentRequired);
    expect(denied.cryptoInputs).toEqual([]);
    expect(denied.lookupInputs).toEqual([]);
    expect(denied.patches).toEqual([]);

    const allowed = harness();
    await allowed.useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, thirdPartyInput, {
      thirdPartyOtpConsentVerified: true,
    });
    expect(allowed.patches[0]).toMatchObject({
      destinationIsThirdParty: true,
      destinationConsentAt: NOW,
    });
  });

  it('allows replacement before claim, but blocks it after claim without lookup or crypto', async () => {
    const replace = harness({ record: operation({ status: 'ready_for_transfer' }) });
    await expect(
      replace.useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, input, {
        thirdPartyOtpConsentVerified: false,
      }),
    ).resolves.toMatchObject({ status: 'verification_required', version: 3 });

    const locked = harness({
      record: operation({
        status: 'ready_for_transfer',
        makerUserId: '55555555-5555-4555-8555-555555555555',
        claimedAt: NOW,
      }),
    });
    await expect(
      locked.useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, input, {
        thirdPartyOtpConsentVerified: false,
      }),
    ).rejects.toBeInstanceOf(ManualRefundDestinationLocked);
    expect(locked.cryptoInputs).toEqual([]);
    expect(locked.lookupInputs).toEqual([]);
    expect(locked.patches).toEqual([]);
  });

  it('rejects stale versions before protecting data and reports a CAS race', async () => {
    const stale = harness();
    await expect(
      stale.useCase.execute(
        TENANT_ID,
        BOOKING_ID,
        'BK-0001',
        OPERATION_ID,
        { ...input, expectedVersion: 1 },
        { thirdPartyOtpConsentVerified: false },
      ),
    ).rejects.toBeInstanceOf(ManualRefundConcurrentUpdate);
    expect(stale.cryptoInputs).toEqual([]);
    expect(stale.lookupInputs).toEqual([]);
    expect(stale.patches).toEqual([]);

    const raced = harness({ casMiss: true });
    await expect(
      raced.useCase.execute(TENANT_ID, BOOKING_ID, 'BK-0001', OPERATION_ID, input, {
        thirdPartyOtpConsentVerified: false,
      }),
    ).rejects.toBeInstanceOf(ManualRefundConcurrentUpdate);
  });
});
