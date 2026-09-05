import { describe, expect, it } from 'vitest';
import {
  fakePort,
  fakeTenantDb,
  manualRefundOperation,
  MANUAL_REFUND_NOW,
  MANUAL_REFUND_OPERATION_ID,
  MANUAL_REFUND_TENANT_ID,
} from '~testing';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { PurgeManualRefundCiphertextUseCase } from './purge-manual-refund-ciphertext.use-case';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('PurgeManualRefundCiphertextUseCase', () => {
  it('purges ciphertext at the 90-day boundary using the tenant and DB clock', async () => {
    const purgeCalls: unknown[] = [];
    const operation = manualRefundOperation({
      status: 'completed',
      completedAt: new Date(MANUAL_REFUND_NOW.getTime() - 90 * DAY_MS),
      transferReference: 'BANK-REF-001',
      destinationAccountFingerprint: 'a'.repeat(64),
      destinationAccountLast4: '4567',
      destinationBankCode: 'VCB',
      destinationConsentAt: new Date('2026-09-04T09:00:00.000Z'),
    });
    const operations = fakePort<IManualRefundOperationRepository>({
      findById: (_tx, tenantId, operationId) => {
        expect(tenantId).toBe(MANUAL_REFUND_TENANT_ID);
        expect(operationId).toBe(MANUAL_REFUND_OPERATION_ID);
        return Promise.resolve(operation);
      },
      purgeCiphertext: (_tx, tenantId, operationId, expectedVersion, eligibleBefore, purgedAt) => {
        purgeCalls.push({ tenantId, operationId, expectedVersion, eligibleBefore, purgedAt });
        return Promise.resolve(true);
      },
    });
    const tenantDb = fakeTenantDb({ now: MANUAL_REFUND_NOW });
    const useCase = new PurgeManualRefundCiphertextUseCase(operations, tenantDb.service);

    await expect(
      useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID),
    ).resolves.toBe(true);

    expect(tenantDb.openedFor).toEqual([MANUAL_REFUND_TENANT_ID]);
    expect(purgeCalls).toEqual([
      {
        tenantId: MANUAL_REFUND_TENANT_ID,
        operationId: MANUAL_REFUND_OPERATION_ID,
        expectedVersion: operation.version,
        eligibleBefore: operation.completedAt,
        purgedAt: MANUAL_REFUND_NOW,
      },
    ]);
    const serialized = JSON.stringify(purgeCalls);
    expect(serialized).not.toContain('secret-ciphertext');
    expect(serialized).not.toContain('a'.repeat(64));
    expect(serialized).not.toContain('BANK-REF-001');
  });

  it('does not purge before 90 days or after ciphertext was already purged', async () => {
    let current = manualRefundOperation({
      status: 'completed',
      completedAt: new Date(MANUAL_REFUND_NOW.getTime() - 90 * DAY_MS + 1),
    });
    const operations = fakePort<IManualRefundOperationRepository>({
      findById: () => Promise.resolve(current),
    });
    const useCase = new PurgeManualRefundCiphertextUseCase(
      operations,
      fakeTenantDb({ now: MANUAL_REFUND_NOW }).service,
    );

    await expect(
      useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID),
    ).resolves.toBe(false);

    current = manualRefundOperation({
      status: 'completed',
      completedAt: new Date(MANUAL_REFUND_NOW.getTime() - 91 * DAY_MS),
      destinationAccountCiphertext: null,
      destinationEncryptionKeyVersion: null,
      ciphertextPurgedAt: new Date(MANUAL_REFUND_NOW.getTime() - DAY_MS),
    });
    await expect(
      useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID),
    ).resolves.toBe(false);
  });
});
