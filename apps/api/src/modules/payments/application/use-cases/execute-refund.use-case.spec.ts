import { describe, expect, it } from 'vitest';
import type { GatewayPaymentSettings } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { GatewayRegistryPort } from '../../domain/ports/gateway-registry.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import type { PaymentGatewayPort } from '../../domain/ports/payment-gateway.port';
import type { IPaymentRepository, PaymentRecord } from '../../domain/ports/payment-repository.port';
import type {
  IRefundBatchRepository,
  RefundBatchRecord,
} from '../../domain/ports/refund-batch-repository.port';
import type {
  CreateRefundData,
  IRefundRepository,
  RefundRecord,
} from '../../domain/ports/refund-repository.port';
import { ExecuteRefundUseCase } from './execute-refund.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const PAID = 500_000n;

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'payment-1',
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    gateway: 'sepay',
    kind: 'deposit',
    amount: PAID,
    capturedAmount: PAID,
    status: 'succeeded',
    checkoutState: 'ready',
    gatewayConfigRevisionId: null,
    refundStrategySnapshot: null,
    manualRefundSlaHoursSnapshot: null,
    gatewayOrderRef: null,
    gatewayOrderId: null,
    gatewayTxnId: null,
    paymentMethod: 'BANK',
    idempotencyKey: 'key-1',
    paidAt: new Date('2026-08-01T10:00:00Z'),
    createdAt: new Date('2026-08-01T09:59:00Z'),
    ...overrides,
  } as PaymentRecord;
}

function batch(overrides: Partial<RefundBatchRecord> = {}): RefundBatchRecord {
  return {
    id: 'refund-batch-1',
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    requestedAmount: 100_000n,
    reason: 'booking_cancellation',
    affectsBookingStatus: true,
    status: 'processing',
    completedAt: null,
    ...overrides,
  };
}

const MANUAL: GatewayPaymentSettings = {
  enabledMethods: ['bank_transfer'],
  refundStrategy: 'manual',
  manualRefundSlaHours: 72,
};
const AUTOMATIC: GatewayPaymentSettings = {
  enabledMethods: ['bank_transfer'],
  refundStrategy: 'automatic_preferred',
  manualRefundSlaHours: 72,
};

interface Options {
  existing?: boolean;
  succeeded?: PaymentRecord | null;
  settings?: GatewayPaymentSettings | null;
  manualRefundV2Enabled?: boolean;
}

interface Harness {
  readonly useCase: ExecuteRefundUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  readonly calls: string[];
  readonly created: CreateRefundData[];
  readonly events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  readonly resolvedPayments: string[];
  readonly initializedOperations: string[];
}

function registryFor(options: Options, resolvedPayments: string[]): GatewayRegistryPort {
  return fakePort<GatewayRegistryPort>({
    resolveForPayment: (_tx, sourcePayment) => {
      resolvedPayments.push(
        `${sourcePayment.gateway}:${sourcePayment.gatewayConfigRevisionId ?? 'legacy'}`,
      );
      return Promise.resolve({
        gateway: fakeCollaborator<PaymentGatewayPort>({ key: sourcePayment.gateway }),
        configRevisionId: sourcePayment.gatewayConfigRevisionId,
        settings: options.settings ?? MANUAL,
      });
    },
  });
}

function harness(options: Options = {}): Harness {
  const calls: string[] = [];
  const created: CreateRefundData[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const resolvedPayments: string[] = [];
  const initializedOperations: string[] = [];

  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        calls.push('outbox');
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  const refunds = fakePort<IRefundRepository>({
    lockForBooking: () => {
      calls.push('lock');
      return Promise.resolve();
    },
    existsForBooking: () => Promise.resolve(options.existing ?? false),
    reservedAmountForPayment: () => Promise.resolve(0n),
    create: (_tx, _tenantId, data) => {
      calls.push('create');
      created.push(data);
      return Promise.resolve({ id: 'refund-1', ...data } as unknown as RefundRecord);
    },
  });
  const refundBatches = fakePort<IRefundBatchRepository>({
    findByBookingReason: (_tx, _bookingId, reason) => {
      calls.push('exists');
      return Promise.resolve(options.existing ? batch({ reason }) : null);
    },
    create: (_tx, tenantId, data) => Promise.resolve(batch({ tenantId, ...data })),
    refreshStatus: () =>
      Promise.resolve({
        batch: batch({
          status: options.settings === AUTOMATIC ? 'processing' : 'manual_required',
        }),
        transitionedToCompleted: false,
      }),
  });
  const manualRefundOperations = fakePort<IManualRefundOperationRepository>({
    isWorkflowEnabled: () => Promise.resolve(options.manualRefundV2Enabled ?? false),
    createForBatch: (_tx, tenantId, refundBatchId) => {
      initializedOperations.push(`${tenantId}:${refundBatchId}`);
      return Promise.resolve();
    },
  });
  const payments = fakePort<IPaymentRepository>({
    findSucceededRefundSources: () => {
      calls.push('payment');
      const source = options.succeeded === undefined ? payment() : options.succeeded;
      return Promise.resolve(source ? [source] : []);
    },
    findSecurityDepositSource: () => {
      calls.push('payment');
      return Promise.resolve(options.succeeded === undefined ? payment() : options.succeeded);
    },
  });

  return {
    useCase: new ExecuteRefundUseCase(
      payments,
      refundBatches,
      refunds,
      manualRefundOperations,
      registryFor(options, resolvedPayments),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    calls,
    created,
    events,
    resolvedPayments,
    initializedOperations,
  };
}

describe('ExecuteRefundUseCase', () => {
  it('does nothing at all for a non-positive amount, not even opening a transaction', async () => {
    const { useCase, tenantDb, calls } = harness();
    await useCase.execute(TENANT_ID, BOOKING_ID, 0n);
    await useCase.execute(TENANT_ID, BOOKING_ID, -1n);
    expect(tenantDb.openedFor).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('takes the per-booking lock before checking whether a refund exists', async () => {
    const { useCase, calls } = harness();
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);
    expect(calls.slice(0, 2)).toEqual(['lock', 'exists']);
  });

  it('is idempotent — a second delivery for the same reason creates nothing', async () => {
    const { useCase, calls, created, events } = harness({ existing: true });
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);
    expect(calls).toEqual(['lock', 'exists']);
    expect(created).toEqual([]);
    expect(events).toEqual([]);
  });

  it('scopes idempotency to the reason, so a deposit refund still goes through', async () => {
    const reasons: string[] = [];
    const tenantDb = fakeTenantDb({
      tx: fakeTx({ outboxEvent: { create: () => Promise.resolve({}) } }),
    });
    const refundBatches = fakePort<IRefundBatchRepository>({
      findByBookingReason: (_tx, _bookingId, reason) => {
        reasons.push(reason);
        return Promise.resolve(reason === 'booking_cancellation' ? batch({ reason }) : null);
      },
      create: (_tx, tenantId, data) => Promise.resolve(batch({ tenantId, ...data })),
      refreshStatus: () => Promise.resolve(null),
    });
    const refunds = fakePort<IRefundRepository>({
      lockForBooking: () => Promise.resolve(),
      reservedAmountForPayment: () => Promise.resolve(0n),
      create: (_tx, _tenantId, data) =>
        Promise.resolve({
          id: 'refund-1',
          refundBatchId: null,
          ...data,
        } as unknown as RefundRecord),
    });
    const resolvedPayments: string[] = [];
    const useCase = new ExecuteRefundUseCase(
      fakePort<IPaymentRepository>({
        findSucceededRefundSources: () => Promise.resolve([payment()]),
        findSecurityDepositSource: () => Promise.resolve(payment()),
      }),
      refundBatches,
      refunds,
      fakePort<IManualRefundOperationRepository>({
        isWorkflowEnabled: () => Promise.resolve(false),
        createForBatch: () => Promise.resolve(),
      }),
      registryFor({}, resolvedPayments),
      tenantDb.service,
      new OutboxService(),
    );

    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n, 'booking_cancellation');
    await useCase.execute(TENANT_ID, BOOKING_ID, 50_000n, 'security_deposit');
    expect(reasons).toEqual(['booking_cancellation', 'security_deposit']);
  });

  it('refunds nothing when the booking never had a succeeded payment', async () => {
    const { useCase, created, events } = harness({ succeeded: null });
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);
    expect(created).toEqual([]);
    expect(events).toEqual([]);
  });

  it("resolves the PAYMENT's own gateway for a pre-foundation legacy payment", async () => {
    const { useCase, resolvedPayments } = harness({ succeeded: payment({ gateway: 'momo' }) });
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);
    expect(resolvedPayments).toEqual(['momo:legacy']);
  });

  it('falls back to manual when legacy settings are manual', async () => {
    const { useCase, created, events } = harness({ settings: MANUAL });
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);
    expect(created[0]).toMatchObject({ executionMode: 'manual', status: 'manual_required' });
    expect(events[0]?.eventType).toBe('refund.requested');
  });

  it('initializes the batch-level operation for an opted-in manual refund', async () => {
    const { useCase, initializedOperations } = harness({
      settings: MANUAL,
      manualRefundV2Enabled: true,
    });
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);
    expect(initializedOperations).toEqual([`${TENANT_ID}:refund-batch-1`]);
  });

  it('requests automatic execution for a wallet gateway', async () => {
    const { useCase, created, events } = harness({
      succeeded: payment({ gateway: 'momo' }),
      settings: AUTOMATIC,
    });
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);
    expect(created[0]).toMatchObject({ executionMode: 'automatic', status: 'pending' });
    expect(events[0]?.eventType).toBe('refund.execution_requested');
  });

  it('requests automatic execution for a full SePay card refund', async () => {
    const { useCase, created } = harness({
      succeeded: payment({ gateway: 'sepay', paymentMethod: 'CARD' }),
      settings: AUTOMATIC,
    });
    await useCase.execute(TENANT_ID, BOOKING_ID, PAID);
    expect(created[0]).toMatchObject({ executionMode: 'automatic' });
  });

  it('falls back to manual for a PARTIAL SePay card refund', async () => {
    const { useCase, created } = harness({
      succeeded: payment({ gateway: 'sepay', paymentMethod: 'CARD' }),
      settings: AUTOMATIC,
    });
    await useCase.execute(TENANT_ID, BOOKING_ID, PAID - 1n);
    expect(created[0]).toMatchObject({ executionMode: 'manual' });
  });

  it('never executes a security-deposit refund automatically', async () => {
    const { useCase, created } = harness({
      succeeded: payment({ gateway: 'momo' }),
      settings: AUTOMATIC,
    });
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n, 'security_deposit');
    expect(created[0]).toMatchObject({ executionMode: 'manual' });
  });

  it('leaves the booking status alone for a security-deposit refund by default', async () => {
    const { useCase, created, events } = harness();
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n, 'security_deposit');
    expect(created[0]?.affectsBookingStatus).toBe(false);
    expect(events[0]?.payload).toMatchObject({ affectsBookingStatus: false });
  });

  it('emits the refund event inside the same transaction, with money as a string', async () => {
    const { useCase, tenantDb, calls, events } = harness();
    await useCase.execute(TENANT_ID, BOOKING_ID, 123_456n);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual(['lock', 'exists', 'payment', 'create', 'outbox']);
    expect(events[0]?.payload).toMatchObject({
      refundId: 'refund-1',
      paymentId: 'payment-1',
      bookingId: BOOKING_ID,
      amount: '123456',
      reason: 'booking_cancellation',
      affectsBookingStatus: true,
    });
  });

  it('uses the complete Payment snapshot even when historical settings differ', async () => {
    const { useCase, created, resolvedPayments } = harness({
      succeeded: payment({
        gatewayConfigRevisionId: 'config-1',
        refundStrategySnapshot: 'manual',
        manualRefundSlaHoursSnapshot: 24,
      }),
      settings: AUTOMATIC,
    });
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);
    expect(created[0]).toMatchObject({ executionMode: 'manual', status: 'manual_required' });
    expect(resolvedPayments).toEqual([]);
  });

  it('uses the exact historical config revision for a legacy Payment with null snapshots', async () => {
    const { useCase, created, resolvedPayments } = harness({
      succeeded: payment({ gatewayConfigRevisionId: 'config-1', gateway: 'momo' }),
      settings: AUTOMATIC,
    });
    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);
    expect(created[0]).toMatchObject({ executionMode: 'automatic' });
    expect(resolvedPayments).toEqual(['momo:config-1']);
  });

  it('fails closed when only half of the refund policy snapshot is populated', async () => {
    const { useCase, created, resolvedPayments } = harness({
      succeeded: payment({
        refundStrategySnapshot: 'automatic_preferred',
        manualRefundSlaHoursSnapshot: null,
      }),
      settings: AUTOMATIC,
    });
    await expect(useCase.execute(TENANT_ID, BOOKING_ID, 100_000n)).rejects.toThrow(
      'Invalid refund policy snapshot',
    );
    expect(created).toEqual([]);
    expect(resolvedPayments).toEqual([]);
  });
});
