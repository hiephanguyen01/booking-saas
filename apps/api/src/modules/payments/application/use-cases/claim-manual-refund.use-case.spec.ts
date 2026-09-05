import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_MAKER_ID, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { ClaimManualRefundUseCase } from './claim-manual-refund.use-case';

describe('ClaimManualRefundUseCase', () => {
  it('claims by expected status/version CAS and records the maker', async () => {
    const seen: unknown[] = []; const tenantDb = fakeTenantDb({ now: MANUAL_REFUND_NOW });
    const current = manualRefundOperation({ makerUserId: null, claimedAt: null });
    const useCase = new ClaimManualRefundUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: (...args) => { seen.push(args.slice(2)); return Promise.resolve({ ...current, makerUserId: MANUAL_REFUND_MAKER_ID, claimedAt: MANUAL_REFUND_NOW, version: 4 }); } }), fakePort<IAuditWriter>({ write: () => Promise.resolve() }), tenantDb.service);
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3 }, MANUAL_REFUND_MAKER_ID);
    expect(seen[0]).toEqual([MANUAL_REFUND_OPERATION_ID, 'ready_for_transfer', 3, { makerUserId: MANUAL_REFUND_MAKER_ID, claimedAt: MANUAL_REFUND_NOW }]);
  });
});
