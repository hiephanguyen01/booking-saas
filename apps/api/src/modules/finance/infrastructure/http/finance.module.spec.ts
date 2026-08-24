import { describe, expect, it } from 'vitest';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import type { OutboxEventRecord } from '../../../../shared/outbox/outbox.types';
import { FinanceModule } from './finance.module';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const REFUND_ID = 'refund-batch-1';

function event(payload: Record<string, unknown>): OutboxEventRecord {
  return {
    id: 'event-1',
    tenantId: TENANT_ID,
    eventType: 'refund.completed',
    payload,
    attempts: 0,
    createdAt: new Date('2026-08-24T00:00:00Z'),
  };
}

function harness() {
  const registry = new OutboxHandlerRegistry();
  const finalized: unknown[][] = [];
  const clawbacks: unknown[][] = [];
  const noop = { execute: () => Promise.resolve() } as never;

  const module = new FinanceModule(
    registry,
    noop,
    noop,
    noop,
    noop,
    {
      execute: (...args: unknown[]) => {
        finalized.push(args);
        return Promise.resolve();
      },
    } as never,
    {
      execute: (...args: unknown[]) => {
        clawbacks.push(args);
        return Promise.resolve();
      },
    } as never,
    noop,
    noop,
  );
  module.onModuleInit();

  const handler = registry.handlersFor('refund.completed')[0];
  if (!handler) throw new Error('refund.completed handler was not registered');
  return { handler, finalized, clawbacks };
}

describe('FinanceModule refund.completed routing', () => {
  it('finalizes a partial dispute refund even when booking status is unaffected', async () => {
    const { handler, finalized, clawbacks } = harness();

    await handler(
      event({
        refundId: REFUND_ID,
        bookingId: BOOKING_ID,
        amount: '200000',
        reason: 'dispute_refund',
        affectsBookingStatus: false,
      }),
    );

    expect(finalized).toEqual([[TENANT_ID, BOOKING_ID, REFUND_ID, 200_000n, 'dispute_refund']]);
    expect(clawbacks).toEqual([[TENANT_ID, BOOKING_ID]]);
  });

  it('keeps security-deposit completion out of settlement finalization', async () => {
    const { handler, finalized, clawbacks } = harness();

    await handler(
      event({
        refundId: REFUND_ID,
        bookingId: BOOKING_ID,
        amount: '200000',
        reason: 'security_deposit',
        affectsBookingStatus: false,
      }),
    );

    expect(finalized).toEqual([]);
    expect(clawbacks).toEqual([]);
  });
});
