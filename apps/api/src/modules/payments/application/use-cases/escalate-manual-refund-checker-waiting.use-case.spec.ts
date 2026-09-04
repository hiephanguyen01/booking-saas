import { describe, expect, it, vi } from 'vitest';
import { fakePort, fakeTenantDb, manualRefundOperation, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID } from '~testing';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { EscalateManualRefundCheckerWaitingUseCase } from './escalate-manual-refund-checker-waiting.use-case';

describe('EscalateManualRefundCheckerWaitingUseCase', () => {
  it('emits one escalation after the checker waiting threshold', async () => {
    const events: unknown[] = [];
    const current = manualRefundOperation({ status: 'transfer_submitted', transferSubmittedAt: new Date('2026-09-03T12:00:00Z'), checkerEscalatedAt: null });
    const operations = fakePort<IManualRefundOperationRepository>({ findById: () => Promise.resolve(current), casUpdate: (_tx, _tenant, _id, _status, _version, patch) => Promise.resolve({ ...current, ...patch, version: current.version + 1 }) });
    const outbox = new OutboxService();
    vi.spyOn(outbox, 'emit').mockImplementation(async (_tx, event) => { events.push(event); });
    const useCase = new EscalateManualRefundCheckerWaitingUseCase(operations, outbox, fakeTenantDb({ now: MANUAL_REFUND_NOW }).service);
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, 24);
    expect(events[0]).toMatchObject({ eventType: 'manual_refund.checker_escalated', payload: { operationId: MANUAL_REFUND_OPERATION_ID } });
  });
});
