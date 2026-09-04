import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, MANUAL_REFUND_CHECKER_ID, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID, manualRefundOperation } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { ReassignManualRefundUseCase } from './reassign-manual-refund.use-case';

describe('ReassignManualRefundUseCase', () => {
  it('CAS-reassigns a claimed operation with actor and reason', async () => {
    const patches: unknown[] = []; const current = manualRefundOperation();
    const useCase = new ReassignManualRefundUseCase(fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: (_tx, _tenant, _id, _status, _version, patch) => { patches.push(patch); return Promise.resolve({ ...current, ...patch, version: 4 }); } }), fakePort<IAuditWriter>({ write: () => Promise.resolve() }), fakeTenantDb({ now: MANUAL_REFUND_NOW }).service);
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, { expectedVersion: 3, makerUserId: MANUAL_REFUND_CHECKER_ID, reason: 'Shift handover' }, 'actor-1');
    expect(patches[0]).toMatchObject({ makerUserId: MANUAL_REFUND_CHECKER_ID, reassignedByUserId: 'actor-1', reassignmentReason: 'Shift handover', reassignedAt: MANUAL_REFUND_NOW });
  });
});
