import { describe, expect, it, vi } from 'vitest';
import {
  fakePort,
  fakeTenantDb,
  MANUAL_REFUND_BATCH_ID,
  MANUAL_REFUND_BOOKING_ID,
  MANUAL_REFUND_TENANT_ID,
} from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { EnableManualRefundWorkflowUseCase } from './enable-manual-refund-workflow.use-case';

describe('EnableManualRefundWorkflowUseCase', () => {
  it('atomically enables the tenant and backfills each legacy manual batch once', async () => {
    const calls: string[] = [];
    const events: unknown[] = [];
    const auditEvents: unknown[] = [];
    const operations = fakePort<IManualRefundOperationRepository>({
      enableWorkflow: (_tx, tenantId) => {
        expect(tenantId).toBe(MANUAL_REFUND_TENANT_ID);
        calls.push('enable');
        return Promise.resolve();
      },
      findManualRequiredBatchesWithoutOperation: () =>
        Promise.resolve([
          { refundBatchId: MANUAL_REFUND_BATCH_ID, bookingId: MANUAL_REFUND_BOOKING_ID },
        ]),
      createForBatch: (_tx, tenantId, refundBatchId) => {
        expect({ tenantId, refundBatchId }).toEqual({
          tenantId: MANUAL_REFUND_TENANT_ID,
          refundBatchId: MANUAL_REFUND_BATCH_ID,
        });
        calls.push('create');
        return Promise.resolve(true);
      },
    });
    const outbox = new OutboxService();
    vi.spyOn(outbox, 'emit').mockImplementation(async (_tx, event) => {
      events.push(event);
    });
    const audit = fakePort<IAuditWriter>({
      write: (_tx, event) => {
        auditEvents.push(event);
        return Promise.resolve();
      },
    });
    const useCase = new EnableManualRefundWorkflowUseCase(
      operations,
      audit,
      outbox,
      fakeTenantDb().service,
    );

    const result = await useCase.execute(MANUAL_REFUND_TENANT_ID, 'platform-user');

    expect(calls).toEqual(['enable', 'create']);
    expect(result).toEqual({ enabled: true, createdOperations: 1 });
    expect(events).toEqual([
      {
        tenantId: MANUAL_REFUND_TENANT_ID,
        eventType: 'manual_refund.destination_requested',
        payload: {
          refundBatchId: MANUAL_REFUND_BATCH_ID,
          bookingId: MANUAL_REFUND_BOOKING_ID,
        },
      },
    ]);
    expect(auditEvents[0]).toMatchObject({
      action: 'manual_refund.workflow_enabled',
      actorUserId: 'platform-user',
      data: { createdOperations: 1 },
    });
  });

  it('does not re-emit when a concurrent or repeated enable already created the operation', async () => {
    const events: unknown[] = [];
    const operations = fakePort<IManualRefundOperationRepository>({
      enableWorkflow: () => Promise.resolve(),
      findManualRequiredBatchesWithoutOperation: () =>
        Promise.resolve([
          { refundBatchId: MANUAL_REFUND_BATCH_ID, bookingId: MANUAL_REFUND_BOOKING_ID },
        ]),
      createForBatch: () => Promise.resolve(false),
    });
    const outbox = new OutboxService();
    vi.spyOn(outbox, 'emit').mockImplementation(async (_tx, event) => {
      events.push(event);
    });
    const useCase = new EnableManualRefundWorkflowUseCase(
      operations,
      fakePort<IAuditWriter>({ write: () => Promise.resolve() }),
      outbox,
      fakeTenantDb().service,
    );

    const result = await useCase.execute(MANUAL_REFUND_TENANT_ID, 'platform-user');

    expect(result.createdOperations).toBe(0);
    expect(events).toEqual([]);
  });
});
