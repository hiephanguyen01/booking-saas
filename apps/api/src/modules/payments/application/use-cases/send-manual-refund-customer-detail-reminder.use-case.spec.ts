import { describe, expect, it, vi } from 'vitest';
import { fakePort, fakeTenantDb, manualRefundOperation, MANUAL_REFUND_NOW, MANUAL_REFUND_OPERATION_ID, MANUAL_REFUND_TENANT_ID } from '~testing';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { SendManualRefundCustomerDetailReminderUseCase } from './send-manual-refund-customer-detail-reminder.use-case';

describe('SendManualRefundCustomerDetailReminderUseCase', () => {
  it('claims each due reminder once and emits an id-only event', async () => {
    const events: unknown[] = [];
    let current = manualRefundOperation({
      status: 'awaiting_details',
      createdAt: new Date('2026-09-02T12:00:00Z'),
      customerDetailReminder24At: null,
    });
    const operations = fakePort<IManualRefundOperationRepository>({
      findById: () => Promise.resolve(current),
      casUpdate: (_tx, _tenant, _id, status, version, patch) => {
        current = { ...current, ...patch, status, version: version + 1 };
        return Promise.resolve(current);
      },
    });
    const outbox = new OutboxService();
    vi.spyOn(outbox, 'emit').mockImplementation(async (_tx, event) => { events.push(event); });
    const useCase = new SendManualRefundCustomerDetailReminderUseCase(operations, outbox, fakeTenantDb({ now: MANUAL_REFUND_NOW }).service);

    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, 24);
    await useCase.execute(MANUAL_REFUND_TENANT_ID, MANUAL_REFUND_OPERATION_ID, 24);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'manual_refund.customer_details_reminder', payload: { operationId: MANUAL_REFUND_OPERATION_ID, hours: 24 } });
    expect(JSON.stringify(events[0])).not.toContain('secret-ciphertext');
  });
});
