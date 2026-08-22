import type { GatewayPaymentSettings } from '@booking/contracts';
import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type {
  PaymentGatewayPort,
  WebhookVerification,
} from '../../domain/ports/payment-gateway.port';
import type { GatewayRegistryPort } from '../../domain/ports/gateway-registry.port';
import type { IPaymentRepository } from '../../domain/ports/payment-repository.port';
import { BadWebhook, InvalidWebhookSignature } from '../payment-http-errors';
import { HandleWebhookUseCase } from './handle-webhook.use-case';

const TENANT_ID = 'tenant-1';
const PAYMENT_ID = 'payment-1';
const BOOKING_ID = 'booking-1';
const DUE = 500_000n;
const REF = 'gw-ref-1';
const RAW = Buffer.from('{"ref":"gw-ref-1"}');
const HEADERS = { 'x-secret-key': 'shhh' };

/** Only the fields this use case reads; the port returns a lighter `PaymentRef`. */
const paymentRef = () =>
  ({
    id: PAYMENT_ID,
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    gateway: 'sepay' as const,
    amount: DUE,
    capturedAmount: null,
    status: 'pending',
    gatewayConfigRevisionId: 'config-sepay-1',
    gatewayTxnId: null,
    gatewayOrderRef: REF,
  }) as unknown as Awaited<ReturnType<IPaymentRepository['findByGatewayReference']>>;

const verification = (overrides: Partial<WebhookVerification> = {}): WebhookVerification => ({
  valid: true,
  event: 'succeeded',
  gatewayTxnId: 'txn-1',
  gatewayOrderId: 'order-1',
  paymentMethod: 'BANK',
  amountVnd: DUE,
  ...overrides,
});

interface Options {
  reference?: string | null;
  found?: ReturnType<typeof paymentRef> | null;
  verification?: WebhookVerification;
  /** What the atomic non-succeeded→succeeded flip answers. */
  flipped?: boolean;
}

interface Harness {
  readonly useCase: HandleWebhookUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  readonly calls: string[];
  readonly succeededWith: unknown[];
  readonly capturedAmounts: bigint[];
  readonly terminals: string[];
  readonly events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  readonly resolvedGateways: Array<string | undefined>;
  readonly resolvedRevisions: Array<string | null>;
}

function harness(options: Options = {}): Harness {
  const calls: string[] = [];
  const succeededWith: unknown[] = [];
  const capturedAmounts: bigint[] = [];
  const terminals: string[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const resolvedGateways: Array<string | undefined> = [];
  const resolvedRevisions: Array<string | null> = [];

  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });

  const gateway = fakeCollaborator<PaymentGatewayPort>({
    peekReference: () => (options.reference === undefined ? REF : options.reference),
    verifyWebhook: () => options.verification ?? verification(),
  });
  const registry = fakePort<GatewayRegistryPort>({
    statelessByKey: () => gateway,
    resolveForPayment: (_tx, payment) => {
      resolvedGateways.push(payment.gateway);
      resolvedRevisions.push(payment.gatewayConfigRevisionId);
      return Promise.resolve({
        gateway,
        configRevisionId: payment.gatewayConfigRevisionId,
        settings: {
          enabledMethods: [],
          refundStrategy: 'manual',
          manualRefundSlaHours: 72,
        } as GatewayPaymentSettings,
      });
    },
  });
  const payments = fakePort<IPaymentRepository>({
    findByGatewayReference: () => {
      calls.push('find');
      return Promise.resolve(options.found === undefined ? paymentRef() : options.found);
    },
    recordCapturedAmountIfPending: (_tx, _id, amount) => {
      calls.push('recordCaptured');
      capturedAmounts.push(amount);
      return Promise.resolve();
    },
    markSucceeded: (_tx, _id, payload, gatewayData) => {
      calls.push('markSucceeded');
      succeededWith.push({ payload, gatewayData });
      return Promise.resolve(options.flipped ?? true);
    },
    markTerminalIfPending: (_tx, _id, status) => {
      calls.push('markTerminal');
      terminals.push(status);
      return Promise.resolve(true);
    },
  });

  return {
    useCase: new HandleWebhookUseCase(payments, registry, tenantDb.service, new OutboxService()),
    tenantDb,
    calls,
    succeededWith,
    capturedAmounts,
    terminals,
    events,
    resolvedGateways,
    resolvedRevisions,
  };
}

describe('HandleWebhookUseCase', () => {
  it('rejects a body it cannot read a reference out of', async () => {
    const { useCase, calls } = harness({ reference: null });

    await expect(useCase.execute('sepay', RAW, HEADERS)).rejects.toBeInstanceOf(BadWebhook);
    expect(calls).toEqual([]);
  });

  it('acknowledges an unknown transaction without opening a transaction', async () => {
    // A gateway will happily post about payments that are not ours; answering 200
    // and doing nothing is the correct behaviour, not an error.
    const { useCase, tenantDb, events } = harness({ found: null });

    await expect(useCase.execute('sepay', RAW, HEADERS)).resolves.toBeUndefined();
    expect(tenantDb.openedFor).toEqual([]);
    expect(events).toEqual([]);
  });

  it('resolves the tenant and exact gateway revision from the payment, not from the URL', async () => {
    const { useCase, tenantDb, resolvedGateways, resolvedRevisions } = harness();

    await useCase.execute('sepay', RAW, HEADERS);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(resolvedGateways).toEqual(['sepay']);
    expect(resolvedRevisions).toEqual(['config-sepay-1']);
  });

  it('refuses an unsigned delivery before touching the payment', async () => {
    const { useCase, calls } = harness({ verification: verification({ valid: false }) });

    await expect(useCase.execute('sepay', RAW, HEADERS)).rejects.toBeInstanceOf(
      InvalidWebhookSignature,
    );
    expect(calls).toEqual(['find']);
  });

  it('ignores a refund notification instead of downgrading the payment', async () => {
    // A SePay TRANSACTION_VOID confirms an already-recorded automatic refund. If
    // it were treated as a terminal event it would mark the original payment
    // failed.
    const { useCase, calls, events } = harness({
      verification: verification({ event: 'refunded' }),
    });

    await useCase.execute('sepay', RAW, HEADERS);

    expect(calls).toEqual(['find']);
    expect(events).toEqual([]);
  });

  it.each([
    ['failed', 'failed'],
    ['cancelled', 'failed'],
    ['expired', 'expired'],
  ] as const)(
    'records %s as the terminal status %s, only while still pending',
    async (event, to) => {
      const { useCase, terminals, events } = harness({
        verification: verification({ event: event as WebhookVerification['event'] }),
      });

      await useCase.execute('sepay', RAW, HEADERS);

      expect(terminals).toEqual([to]);
      // No `payment.succeeded`: a late failure must not tell Booking to confirm.
      expect(events).toEqual([]);
    },
  );

  it('quarantines an underpayment and records the observed capture', async () => {
    const captured = DUE - 1n;
    const { useCase, calls, capturedAmounts, events } = harness({
      verification: verification({ amountVnd: captured }),
    });

    await expect(useCase.execute('sepay', RAW, HEADERS)).resolves.toBeUndefined();

    expect(capturedAmounts).toEqual([captured]);
    expect(calls).not.toContain('markSucceeded');
    expect(events).toEqual([]);
  });

  it('quarantines an overpayment and records the observed capture', async () => {
    const captured = DUE + 1n;
    const { useCase, calls, capturedAmounts, events } = harness({
      verification: verification({ amountVnd: captured }),
    });

    await expect(useCase.execute('sepay', RAW, HEADERS)).resolves.toBeUndefined();

    expect(capturedAmounts).toEqual([captured]);
    expect(calls).not.toContain('markSucceeded');
    expect(events).toEqual([]);
  });

  it('records the payment and announces it once', async () => {
    const { useCase, succeededWith, capturedAmounts, events } = harness();

    await useCase.execute('sepay', RAW, HEADERS);

    expect(capturedAmounts).toEqual([]);
    expect(succeededWith).toEqual([
      {
        payload: { event: 'succeeded', amountVnd: DUE.toString(), gatewayOrderRef: 'gw-ref-1' },
        gatewayData: {
          capturedAmount: DUE,
          gatewayTxnId: 'txn-1',
          gatewayOrderId: 'order-1',
          paymentMethod: 'BANK',
        },
      },
    ]);
    expect(events).toEqual([
      {
        eventType: 'payment.succeeded',
        payload: { paymentId: PAYMENT_ID, bookingId: BOOKING_ID },
      },
    ]);
  });

  it('announces nothing when the flip did not happen — five deliveries, one event', async () => {
    // The idempotency guard. `markSucceeded` is an atomic non-succeeded→succeeded
    // UPDATE, so only the first of N duplicate deliveries gets `true`; emitting on
    // the others would confirm the booking N times.
    const { useCase, events } = harness({ flipped: false });

    await useCase.execute('sepay', RAW, HEADERS);

    expect(events).toEqual([]);
  });

  it('falls back to the peeked reference when the gateway supplies no order ref', async () => {
    const { useCase, succeededWith } = harness({
      verification: verification({ gatewayOrderRef: undefined }),
    });

    await useCase.execute('sepay', RAW, HEADERS);

    expect(succeededWith[0]).toMatchObject({
      payload: { gatewayOrderRef: REF },
    });
  });

  it('prefers the order ref the gateway reports over the peeked one', async () => {
    const { useCase, succeededWith } = harness({
      verification: verification({ gatewayOrderRef: 'authoritative-ref' }),
    });

    await useCase.execute('sepay', RAW, HEADERS);

    expect(succeededWith[0]).toMatchObject({
      payload: { gatewayOrderRef: 'authoritative-ref' },
    });
  });
});
