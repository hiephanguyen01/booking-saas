import { describe, expect, it } from 'vitest';
import type { GatewayPaymentSettings } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type {
  GatewayConfigRecord,
  IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import type { IPaymentRepository, PaymentRecord } from '../../domain/ports/payment-repository.port';
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
    status: 'succeeded',
    gatewayOrderRef: null,
    gatewayOrderId: null,
    gatewayTxnId: null,
    paymentMethod: 'BANK',
    idempotencyKey: 'key-1',
    paidAt: new Date('2026-08-01T10:00:00Z'),
    ...overrides,
  } as PaymentRecord;
}

/** Only `settings` is read off the config; the credential union is irrelevant here. */
const configWith = (settings: GatewayPaymentSettings): GatewayConfigRecord =>
  ({
    id: 'config-1',
    gateway: 'sepay',
    environment: 'production',
    credentials: {},
    settings,
  }) as unknown as GatewayConfigRecord;

const AUTOMATIC: GatewayPaymentSettings = {
  enabledMethods: ['bank_transfer'],
  refundStrategy: 'automatic_preferred',
  manualRefundSlaHours: 72,
};

interface Options {
  existing?: boolean;
  succeeded?: PaymentRecord | null;
  settings?: GatewayPaymentSettings | null;
}

interface Harness {
  readonly useCase: ExecuteRefundUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  /** Every port call in order — the lock has to come first. */
  readonly calls: string[];
  readonly created: CreateRefundData[];
  readonly events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  /** Gateways the config lookup was asked about. */
  readonly configLookups: string[];
}

function harness(options: Options = {}): Harness {
  const calls: string[] = [];
  const created: CreateRefundData[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const configLookups: string[] = [];

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
    existsForBooking: () => {
      calls.push('exists');
      return Promise.resolve(options.existing ?? false);
    },
    create: (_tx, _tenantId, data) => {
      calls.push('create');
      created.push(data);
      return Promise.resolve({ id: 'refund-1', ...data } as unknown as RefundRecord);
    },
  });
  const payments = fakePort<IPaymentRepository>({
    findSucceededByBooking: () => {
      calls.push('payment');
      return Promise.resolve(options.succeeded === undefined ? payment() : options.succeeded);
    },
  });
  const configs = fakePort<IGatewayConfigRepository>({
    findByGateway: (_tx, _tenantId, gateway) => {
      configLookups.push(gateway);
      return Promise.resolve(options.settings ? configWith(options.settings) : null);
    },
  });

  return {
    useCase: new ExecuteRefundUseCase(
      payments,
      refunds,
      configs,
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    calls,
    created,
    events,
    configLookups,
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
    // `booking.cancelled` and `booking.returned` both trigger this. If the
    // exists-check ran first, two deliveries could both pass it and double-refund
    // at the gateway.
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
    // A cancellation refund and a security-deposit refund are two separate
    // movements on the same booking; deduplicating on bookingId alone would
    // swallow the second.
    const reasons: string[] = [];
    const tenantDb = fakeTenantDb({
      tx: fakeTx({ outboxEvent: { create: () => Promise.resolve({}) } }),
    });
    const refunds = fakePort<IRefundRepository>({
      lockForBooking: () => Promise.resolve(),
      existsForBooking: (_tx, _bookingId, reason) => {
        reasons.push(reason);
        return Promise.resolve(reason === 'booking_cancellation');
      },
      create: (_tx, _tenantId, data) =>
        Promise.resolve({ id: 'refund-1', ...data } as unknown as RefundRecord),
    });
    const useCase = new ExecuteRefundUseCase(
      fakePort<IPaymentRepository>({ findSucceededByBooking: () => Promise.resolve(payment()) }),
      refunds,
      fakePort<IGatewayConfigRepository>({ findByGateway: () => Promise.resolve(null) }),
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

  it("reads the config of the PAYMENT's gateway, not the tenant's base gateway", async () => {
    // With parallel gateways the base config does not describe a wallet payment's
    // own refund strategy.
    const { useCase, configLookups } = harness({ succeeded: payment({ gateway: 'momo' }) });

    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);

    expect(configLookups).toEqual(['momo']);
  });

  it('falls back to manual when the gateway has no config row', async () => {
    const { useCase, created, events } = harness({ settings: null });

    await useCase.execute(TENANT_ID, BOOKING_ID, 100_000n);

    expect(created[0]).toMatchObject({ executionMode: 'manual', status: 'manual_required' });
    expect(events[0]?.eventType).toBe('refund.requested');
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
});
