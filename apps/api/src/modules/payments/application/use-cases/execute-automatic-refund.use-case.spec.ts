import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayPaymentSettings } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { GatewayConfigRecord } from '../../domain/ports/gateway-config-repository.port';
import type { GatewayRegistryPort } from '../../domain/ports/gateway-registry.port';
import type { PaymentGatewayPort, RefundInput } from '../../domain/ports/payment-gateway.port';
import type { IPaymentRepository, PaymentRecord } from '../../domain/ports/payment-repository.port';
import type { IRefundRepository, RefundRecord } from '../../domain/ports/refund-repository.port';
import { ExecuteAutomaticRefundUseCase } from './execute-automatic-refund.use-case';

const TENANT_ID = 'tenant-1';
const REFUND_ID = 'refund-1';
const BOOKING_ID = 'booking-1';
const PAYMENT_ID = 'payment-1';
const AMOUNT = 250_000n;
const NOW = new Date('2026-08-19T10:00:00Z');

function refund(overrides: Partial<RefundRecord> = {}): RefundRecord {
  return {
    id: REFUND_ID,
    tenantId: TENANT_ID,
    paymentId: PAYMENT_ID,
    bookingId: BOOKING_ID,
    amount: AMOUNT,
    status: 'pending',
    gatewayRefundId: null,
    reason: 'booking_cancellation',
    affectsBookingStatus: true,
    evidence: null,
    executionMode: 'automatic',
    dueAt: null,
    completedAt: null,
    ...overrides,
  } as RefundRecord;
}

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: PAYMENT_ID,
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    gateway: 'momo',
    kind: 'deposit',
    amount: 500_000n,
    capturedAmount: 500_000n,
    status: 'succeeded',
    checkoutState: 'ready',
    gatewayConfigRevisionId: 'config-1',
    gatewayOrderRef: 'ORDER-9',
    gatewayOrderId: null,
    gatewayTxnId: 'TXN-9',
    paymentMethod: 'WALLET',
    idempotencyKey: 'key-1',
    paidAt: NOW,
    ...overrides,
  } as PaymentRecord;
}

const configWith = (manualRefundSlaHours: number): GatewayConfigRecord =>
  ({
    id: 'config-1',
    gateway: 'momo',
    environment: 'production',
    credentials: {},
    settings: {
      enabledMethods: ['momo_wallet'],
      refundStrategy: 'automatic_preferred',
      manualRefundSlaHours,
    } as GatewayPaymentSettings,
  }) as unknown as GatewayConfigRecord;

interface Options {
  record?: RefundRecord | null;
  /** What the second transaction re-reads, if it differs from the first. */
  recheck?: RefundRecord | null;
  succeeded?: PaymentRecord | null;
  config?: GatewayConfigRecord | null;
  supported?: boolean;
  providerStatus?: string;
  completed?: RefundRecord | null;
  manualised?: RefundRecord | null;
}

interface Harness {
  readonly useCase: ExecuteAutomaticRefundUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  readonly calls: string[];
  readonly refundCalls: RefundInput[];
  readonly completions: Array<string | null>;
  readonly dueDates: Date[];
  readonly events: Array<{ eventType: string; payload: Record<string, unknown> }>;
}

function harness(options: Options = {}): Harness {
  const calls: string[] = [];
  const refundCalls: RefundInput[] = [];
  const completions: Array<string | null> = [];
  const dueDates: Date[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  let reads = 0;

  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx, now: NOW });

  const refunds = fakePort<IRefundRepository>({
    findById: () => {
      reads += 1;
      calls.push('findRefund');
      if (reads > 1 && options.recheck !== undefined) return Promise.resolve(options.recheck);
      return Promise.resolve(options.record === undefined ? refund() : options.record);
    },
    lockForBooking: () => {
      calls.push('lock');
      return Promise.resolve();
    },
    completeAutomatic: (_tx, _id, gatewayRefundId) => {
      calls.push('complete');
      completions.push(gatewayRefundId);
      return Promise.resolve(
        options.completed === undefined
          ? refund({ status: 'succeeded', gatewayRefundId })
          : options.completed,
      );
    },
    requireManual: (_tx, _id, dueAt) => {
      calls.push('requireManual');
      dueDates.push(dueAt);
      return Promise.resolve(
        options.manualised === undefined
          ? refund({ status: 'manual_required', dueAt })
          : options.manualised,
      );
    },
  });

  const gateway = fakeCollaborator<PaymentGatewayPort>({
    refund: (input: RefundInput) => {
      calls.push('gatewayRefund');
      refundCalls.push(input);
      return Promise.resolve(
        options.supported === false
          ? { supported: false }
          : { supported: true, refundId: 'gw-refund-1' },
      );
    },
    queryPaymentStatus: () => {
      calls.push('queryStatus');
      return Promise.resolve({ status: options.providerStatus ?? 'succeeded', amountVnd: AMOUNT });
    },
  });

  const resolvedConfig = options.config === undefined ? configWith(48) : options.config;
  const settings =
    resolvedConfig?.settings ??
    ({
      enabledMethods: ['momo_wallet'],
      refundStrategy: 'automatic_preferred',
      manualRefundSlaHours: 72,
    } as GatewayPaymentSettings);

  const useCase = new ExecuteAutomaticRefundUseCase(
    fakePort<IPaymentRepository>({
      findById: () => Promise.resolve(options.succeeded === undefined ? payment() : options.succeeded),
    }),
    refunds,
    fakePort<GatewayRegistryPort>({
      resolveForPayment: (_tx, sourcePayment) => {
        calls.push(`resolve:${sourcePayment.id}:${sourcePayment.gatewayConfigRevisionId ?? 'legacy'}`);
        return Promise.resolve({
          gateway,
          configRevisionId: resolvedConfig?.id ?? sourcePayment.gatewayConfigRevisionId,
          settings,
        });
      },
    }),
    tenantDb.service,
    new OutboxService(),
  );

  return { useCase, tenantDb, calls, refundCalls, completions, dueDates, events };
}

describe('ExecuteAutomaticRefundUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing for an unknown refund', async () => {
    const { useCase, calls } = harness({ record: null });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(calls).not.toContain('gatewayRefund');
  });

  it.each([
    ['manual_required', 'automatic'],
    ['succeeded', 'automatic'],
    ['pending', 'manual'],
  ] as const)('does nothing for a %s / %s refund', async (status, executionMode) => {
    const { useCase, calls } = harness({ record: refund({ status, executionMode }) });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(calls).not.toContain('gatewayRefund');
  });

  it('does nothing when the durable source payment is missing', async () => {
    const { useCase, calls } = harness({ succeeded: null });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(calls).not.toContain('gatewayRefund');
  });

  it('refuses to refund against a payment the intent was not written for', async () => {
    // A later, different succeeded payment on the same booking must not be the
    // one the money comes back out of.
    const { useCase, calls } = harness({ succeeded: payment({ id: 'payment-2' }) });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(calls).not.toContain('gatewayRefund');
  });

  it('resolves the exact gateway revision from the durable source payment', async () => {
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(calls).toContain('resolve:payment-1:config-1');
  });

  it('calls the provider between the two transactions, never inside one', async () => {
    // A gateway round-trip inside an open transaction holds a Postgres connection
    // and its locks for the length of a network call.
    const { useCase, tenantDb, calls } = harness();

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID, TENANT_ID]);
    expect(calls.indexOf('gatewayRefund')).toBeGreaterThan(calls.indexOf('findRefund'));
    expect(calls.indexOf('gatewayRefund')).toBeLessThan(calls.indexOf('lock'));
  });

  it('targets the provider order reference, falling back through txn id to the payment id', async () => {
    const withOrderRef = harness();
    await withOrderRef.useCase.execute(TENANT_ID, REFUND_ID);
    expect(withOrderRef.refundCalls[0]).toMatchObject({
      gatewayOrderRef: 'ORDER-9',
      gatewayTxnId: 'TXN-9',
      amountVnd: AMOUNT,
      reason: 'booking_cancellation',
    });

    const withTxnOnly = harness({ succeeded: payment({ gatewayOrderRef: null }) });
    await withTxnOnly.useCase.execute(TENANT_ID, REFUND_ID);
    expect(withTxnOnly.refundCalls[0]).toMatchObject({ gatewayOrderRef: 'TXN-9' });

    const withNeither = harness({
      succeeded: payment({ gatewayOrderRef: null, gatewayTxnId: null }),
    });
    await withNeither.useCase.execute(TENANT_ID, REFUND_ID);
    expect(withNeither.refundCalls[0]).toMatchObject({
      gatewayOrderRef: PAYMENT_ID,
      gatewayTxnId: PAYMENT_ID,
    });
  });

  it('completes the refund and announces it when the provider pushed the money back', async () => {
    const { useCase, completions, events } = harness();

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(completions).toEqual(['gw-refund-1']);
    expect(events).toEqual([
      {
        eventType: 'refund.completed',
        payload: {
          refundId: REFUND_ID,
          paymentId: PAYMENT_ID,
          bookingId: BOOKING_ID,
          amount: AMOUNT.toString(),
          reason: 'booking_cancellation',
          affectsBookingStatus: true,
        },
      },
    ]);
  });

  it('treats an already-refunded provider state as success on a retry', async () => {
    // A previous attempt voided successfully but crashed before persisting; the
    // repeated void is rejected, and only the provider status makes the retry safe.
    const { useCase, completions, events } = harness({
      supported: false,
      providerStatus: 'refunded',
    });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(completions).toEqual(['reconciled:void:ORDER-9']);
    expect(events[0]?.eventType).toBe('refund.completed');
  });

  it('falls back to a manual refund when the provider cannot do it', async () => {
    const { useCase, dueDates, events } = harness({
      supported: false,
      providerStatus: 'succeeded',
    });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(dueDates).toEqual([new Date(NOW.getTime() + 48 * 60 * 60 * 1000)]);
    expect(events[0]?.eventType).toBe('refund.requested');
  });

  it("takes the manual SLA from the PAYMENT's gateway, defaulting to 72 hours", async () => {
    const { useCase, dueDates } = harness({
      supported: false,
      providerStatus: 'succeeded',
      config: null,
    });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(dueDates).toEqual([new Date(NOW.getTime() + 72 * 60 * 60 * 1000)]);
  });

  it('writes nothing when the refund stopped being executable while the provider was called', async () => {
    // The whole reason for the re-read under the lock: a manual confirmation or a
    // concurrent retry may have finished it during the network round-trip.
    const { useCase, calls, events } = harness({ recheck: refund({ status: 'succeeded' }) });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(calls).not.toContain('complete');
    expect(events).toEqual([]);
  });

  it('announces nothing when the guarded completion updated no row', async () => {
    const { useCase, events } = harness({ completed: null });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(events).toEqual([]);
  });

  it('locks the booking before re-reading the refund', async () => {
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(calls.indexOf('lock')).toBeLessThan(calls.lastIndexOf('findRefund'));
  });
});
