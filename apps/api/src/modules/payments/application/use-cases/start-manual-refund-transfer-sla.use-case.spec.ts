import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, manualRefundOperation, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID } from '~testing';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { StartManualRefundTransferSlaUseCase } from './start-manual-refund-transfer-sla.use-case';

describe('StartManualRefundTransferSlaUseCase', () => {
  it('starts the transfer clock from readyAt, never from operation creation', async () => {
    const patches: unknown[] = [];
    const current = manualRefundOperation({ status: 'ready_for_transfer', readyAt: new Date('2026-09-04T09:00:00Z'), transferDueAt: null });
    const useCase = new StartManualRefundTransferSlaUseCase(
      fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: (_tx, _tenant, _id, _status, _version, patch) => { patches.push(patch); return Promise.resolve({ ...current, ...patch, version: current.version + 1 }); } }),
      fakeTenantDb({ now: MANUAL_REFUND_NOW }).service,
    );
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, 72);
    expect(patches[0]).toMatchObject({ transferDueAt: new Date('2026-09-07T09:00:00Z') });
  });
});
