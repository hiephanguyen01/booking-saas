import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayPaymentSettings } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { GatewayConfigRecord } from '../../domain/ports/gateway-config-repository.port';
import type { GatewayRegistryPort } from '../../domain/ports/gateway-registry.port';
import type {
  PaymentGatewayPort,
  RefundInput,
  RefundResult,
  RefundStatusInput,
} from '../../domain/ports/payment-gateway.port';
import type { IPaymentRepository, PaymentRecord } from '../../domain/ports/payment-repository.port';
import type { IRefundRepository, RefundRecord } from '../../domain/ports/refund-repository.port';
import { ExecuteAutomaticRefundUseCase } from './execute-automatic-refund.use-case';

const TENANT_ID = 'tenant-1';
const REFUND_ID = 'refund-1';
const BOOKING_ID = 'booking-1';
const PAYMENT_ID = 'payment-1';
const AMOUNT = 250_000n;
const NOW = new Date('2026-08-19T10:00:00Z');

type PlannedRefundStatus = 'succeeded' | 'pending' | 'failed' | 'unsupported';
interface PlannedRefundResult {
  status: PlannedRefundStatus;
  refundId?: string;
}
interface PlannedRefundStatusInput {
  refundId: string;
  gatewayRefundId: string | null;
}
interface GatewayWithRefundQuery extends PaymentGatewayPort {
  queryRefundStatus(input: PlannedRefundStatusInput): Promise<PlannedRefundResult>;
}
interface RefundRepositoryWithAutomaticState extends IRefundRepository {
  markAutomaticPending(
    tx: PrismaTx,
    id: string,
    gatewayRefundId: string | null,
  ): Promise<RefundRecord | null>;
  failAutomatic(
    tx: PrismaTx,
    id: string,
    gatewayRefundId: string | null,
  ): Promise<RefundRecord | null>;
}

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
    refundStrategySnapshot: null,
    manualRefundSlaHoursSnapshot: null,
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
  providerResult?: PlannedRefundResult;
  refundStatusResult?: PlannedRefundResult;
  completed?: RefundRecord | null;
  manualised?: RefundRecord | null;
  pendingResult?: RefundRecord | null;
  failedResult?: RefundRecord | null;
}

interface Harness {
  readonly useCase: ExecuteAutomaticRefundUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  readonly calls: string[];
  readonly refundCalls: Array<RefundInput & { refundId?: string }>;
  readonly refundStatusCalls: PlannedRefundStatusInput[];
  readonly completions: Array<string | null>;
  readonly pendingRefs: Array<string | null>;
  readonly failedRefs: Array<string | null>;
  readonly dueDates: Date[];
  readonly events: Array<{ eventType: string; payload: Record<string, unknown> }>;
}

function harness(options: Options = {}): Harness {
  const calls: string[] = [];
  const refundCalls: Array<RefundInput & { refundId?: string }> = [];
  const refundStatusCalls: PlannedRefundStatusInput[] = [];
  const completions: Array<string | null> = [];
  const pendingRefs: Array<string | null> = [];
  const failedRefs: Array<string | null> = [];
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

  const refunds = fakePort<RefundRepositoryWithAutomaticState>({
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
    markAutomaticPending: (_tx, _id, gatewayRefundId) => {
      calls.push('markPending');
      pendingRefs.push(gatewayRefundId);
      return Promise.resolve(
        options.pendingResult === undefined
          ? refund({ status: 'pending', gatewayRefundId })
          : options.pendingResult,
      );
    },
    failAutomatic: (_tx, _id, gatewayRefundId) => {
      calls.push('failAutomatic');
      failedRefs.push(gatewayRefundId);
      return Promise.resolve(
        options.failedResult === undefined
          ? refund({ status: 'failed', gatewayRefundId })
          : options.failedResult,
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

  const gateway = fakeCollaborator<GatewayWithRefundQuery>({
    refund: (input: RefundInput) => {
      calls.push('gatewayRefund');
      refundCalls.push(input);
      return Promise.resolve(
        (options.providerResult ?? {
          status: 'succeeded',
          refundId: 'gw-refund-1',
        }) as unknown as RefundResult,
      );
    },
    queryRefundStatus: (input: RefundStatusInput) => {
      calls.push('queryRefundStatus');
      refundStatusCalls.push(input);
      return Promise.resolve(
        options.refundStatusResult ?? { status: 'pending', refundId: input.gatewayRefundId ?? undefined },
      );
    },
    queryPaymentStatus: () => {
      calls.push('queryPaymentStatus');
      return Promise.resolve({ status: 'succeeded', amountVnd: AMOUNT });
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

  return {
    useCase,
    tenantDb,
    calls,
    refundCalls,
    refundStatusCalls,
    completions,
    pendingRefs,
    failedRefs,
    dueDates,
    events,
  };
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
    ['failed', 'automatic'],
    ['pending', 'manual'],
  ] as const)('does nothing for a %s / %s refund', async (status, executionMode) => {
    const { useCase, calls } = harness({ record: refund({ status, executionMode }) });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(calls).not.toContain('gatewayRefund');
    expect(calls).not.toContain('queryRefundStatus');
  });

  it('does nothing when the durable source payment is missing', async () => {
    const { useCase, calls } = harness({ succeeded: null });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(calls).not.toContain('gatewayRefund');
  });

  it('refuses to refund against a payment the intent was not written for', async () => {
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
    const { useCase, tenantDb, calls } = harness();
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(tenantDb.openedFor).toEqual([TENANT_ID, TENANT_ID]);
    expect(calls.indexOf('gatewayRefund')).toBeGreaterThan(calls.indexOf('findRefund'));
    expect(calls.indexOf('gatewayRefund')).toBeLessThan(calls.indexOf('lock'));
  });

  it('sends the durable local refund id and provider references to a new refund call', async () => {
    const { useCase, refundCalls } = harness();
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(refundCalls[0]).toMatchObject({
      refundId: REFUND_ID,
      gatewayOrderRef: 'ORDER-9',
      gatewayTxnId: 'TXN-9',
      amountVnd: AMOUNT,
      reason: 'booking_cancellation',
    });
  });

  it('falls back through txn id to payment id for provider references', async () => {
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

  it('completes and announces a normalized succeeded refund', async () => {
    const { useCase, completions, events, calls } = harness({
      providerResult: { status: 'succeeded', refundId: 'gw-refund-1' },
    });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(completions).toEqual(['gw-refund-1']);
    expect(calls).not.toContain('queryPaymentStatus');
    expect(events[0]?.eventType).toBe('refund.completed');
  });

  it('keeps a normalized pending refund pending and persists its provider reference', async () => {
    const { useCase, pendingRefs, events, calls } = harness({
      providerResult: { status: 'pending', refundId: 'gw-refund-pending' },
    });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(pendingRefs).toEqual(['gw-refund-pending']);
    expect(calls).not.toContain('queryPaymentStatus');
    expect(events).toEqual([]);
  });

  it('queries the refund itself on a retry and never creates the provider refund again', async () => {
    const { useCase, refundStatusCalls, completions, calls } = harness({
      record: refund({ gatewayRefundId: 'gw-refund-pending' }),
      refundStatusResult: { status: 'succeeded', refundId: 'gw-refund-pending' },
    });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(calls).not.toContain('gatewayRefund');
    expect(calls).not.toContain('queryPaymentStatus');
    expect(refundStatusCalls).toEqual([
      { refundId: REFUND_ID, gatewayRefundId: 'gw-refund-pending' },
    ]);
    expect(completions).toEqual(['gw-refund-pending']);
  });

  it('preserves the existing provider reference when a refund-status query remains pending', async () => {
    const { useCase, pendingRefs } = harness({
      record: refund({ gatewayRefundId: 'gw-refund-pending' }),
      refundStatusResult: { status: 'pending' },
    });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(pendingRefs).toEqual(['gw-refund-pending']);
  });

  it('marks a normalized failed automatic refund failed without success/manual events', async () => {
    const { useCase, failedRefs, events, calls } = harness({
      providerResult: { status: 'failed', refundId: 'gw-refund-failed' },
    });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(failedRefs).toEqual(['gw-refund-failed']);
    expect(calls).not.toContain('queryPaymentStatus');
    expect(events).toEqual([]);
  });

  it('falls back to manual only for an explicitly unsupported provider refund', async () => {
    const { useCase, dueDates, events, calls } = harness({
      providerResult: { status: 'unsupported' },
    });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(dueDates).toEqual([new Date(NOW.getTime() + 48 * 60 * 60 * 1000)]);
    expect(calls).not.toContain('queryPaymentStatus');
    expect(events[0]?.eventType).toBe('refund.requested');
  });

  it("takes the manual SLA from the payment gateway, defaulting to 72 hours", async () => {
    const { useCase, dueDates } = harness({
      providerResult: { status: 'unsupported' },
      config: null,
    });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(dueDates).toEqual([new Date(NOW.getTime() + 72 * 60 * 60 * 1000)]);
  });

  it('takes the manual SLA from the complete Payment snapshot before historical settings', async () => {
    const { useCase, dueDates } = harness({
      providerResult: { status: 'unsupported' },
      succeeded: payment({
        refundStrategySnapshot: 'automatic_preferred',
        manualRefundSlaHoursSnapshot: 12,
      }),
    });

    await useCase.execute(TENANT_ID, REFUND_ID);

    expect(dueDates).toEqual([new Date(NOW.getTime() + 12 * 60 * 60 * 1000)]);
  });

  it('fails closed on a half-populated Payment refund snapshot before provider I/O', async () => {
    const { useCase, calls } = harness({
      succeeded: payment({
        refundStrategySnapshot: 'automatic_preferred',
        manualRefundSlaHoursSnapshot: null,
      }),
    });

    await expect(useCase.execute(TENANT_ID, REFUND_ID)).rejects.toThrow(
      'Invalid refund policy snapshot',
    );
    expect(calls).not.toContain('gatewayRefund');
  });

  it('writes nothing when the refund stopped being executable while the provider was called', async () => {
    const { useCase, calls, events } = harness({ recheck: refund({ status: 'succeeded' }) });
    await useCase.execute(TENANT_ID, REFUND_ID);
    expect(calls).not.toContain('complete');
    expect(calls).not.toContain('markPending');
    expect(calls).not.toContain('failAutomatic');
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
