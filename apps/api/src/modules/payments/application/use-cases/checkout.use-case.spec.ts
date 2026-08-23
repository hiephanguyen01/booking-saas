import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomerPaymentMethod, GatewayPaymentSettings } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  AmountExceedsGatewayLimit,
  BookingNotPayable,
  InvalidStorefrontHost,
  NoActiveGateway,
  NothingLeftToPay,
  PaymentMethodUnavailable,
  PaymentStorefrontSuspended,
} from '../../domain/errors/payment-errors';
import type { GatewayConfigRecord } from '../../domain/ports/gateway-config-repository.port';
import type { GatewayRegistryPort } from '../../domain/ports/gateway-registry.port';
import type { GatewayKey, PaymentGatewayPort } from '../../domain/ports/payment-gateway.port';
import type {
  IPaymentBookingReader,
  PaymentBookingRecord,
} from '../../domain/ports/payment-booking-reader.port';
import type {
  CreatePendingCheckoutData,
  IPaymentRepository,
  PaymentRecord,
} from '../../domain/ports/payment-repository.port';
import type { IRefundPolicyRepository } from '../../domain/ports/refund-policy-repository.port';
import { CheckoutUseCase } from './checkout.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const CODE = 'BK-0001';

function booking(overrides: Partial<PaymentBookingRecord> = {}): PaymentBookingRecord {
  return {
    id: BOOKING_ID,
    code: CODE,
    status: 'pending_payment',
    bookingMode: 'daily',
    depositAmount: 400_000n,
    securityDeposit: 100_000n,
    finalAmount: 1_000_000n,
    paidAmount: 0n,
    ...overrides,
  } as PaymentBookingRecord;
}

/** Only `gateway` and `settings.enabledMethods` drive routing. */
const config = (
  gateway: GatewayKey,
  enabledMethods: CustomerPaymentMethod[],
): GatewayConfigRecord =>
  ({
    id: `config-${gateway}`,
    gateway,
    environment: 'production',
    credentials: {},
    settings: {
      enabledMethods,
      refundStrategy: 'manual',
      manualRefundSlaHours: 72,
    } as GatewayPaymentSettings,
  }) as unknown as GatewayConfigRecord;

function paymentRecord(
  data: CreatePendingCheckoutData,
  overrides: Partial<PaymentRecord> = {},
): PaymentRecord {
  return {
    id: data.id,
    tenantId: TENANT_ID,
    bookingId: data.bookingId,
    gateway: data.gateway,
    kind: data.kind,
    amount: data.amount,
    capturedAmount: null,
    status: 'pending',
    checkoutState: data.checkoutState,
    gatewayConfigRevisionId: data.gatewayConfigRevisionId,
    refundStrategySnapshot: data.refundStrategySnapshot,
    manualRefundSlaHoursSnapshot: data.manualRefundSlaHoursSnapshot,
    gatewayOrderRef: data.gatewayOrderRef ?? null,
    gatewayOrderId: null,
    gatewayTxnId: null,
    paymentMethod: data.paymentMethod ?? null,
    idempotencyKey: data.idempotencyKey,
    paidAt: null,
    ...overrides,
  };
}

interface Options {
  live?: boolean;
  record?: PaymentBookingRecord | null;
  configs?: GatewayConfigRecord[];
  gatewayKey?: GatewayKey;
  pending?: { id: string; destination: unknown } | null;
  /** What the provider reports back from `createPayment`. */
  gatewayOrderRef?: string;
  gatewayTxnId?: string | null;
}

type ReadyData = Parameters<IPaymentRepository['markCheckoutReady']>[2];

interface Harness {
  readonly useCase: CheckoutUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  readonly created: CreatePendingCheckoutData[];
  readonly readyWrites: Array<{ paymentId: string; data: ReadyData }>;
  readonly gatewayCalls: Array<Record<string, unknown>>;
  readonly routedTo: Array<GatewayKey | undefined>;
  readonly locks: Array<{ bookingId: string; kind: string; paymentMethod: string }>;
}

function harness(options: Options = {}): Harness {
  const created: CreatePendingCheckoutData[] = [];
  const readyWrites: Array<{ paymentId: string; data: ReadyData }> = [];
  const gatewayCalls: Array<Record<string, unknown>> = [];
  const routedTo: Array<GatewayKey | undefined> = [];
  const locks: Array<{ bookingId: string; kind: string; paymentMethod: string }> = [];
  const tenantDb = fakeTenantDb();
  const key = options.gatewayKey ?? 'sepay';

  const gateway = fakeCollaborator<PaymentGatewayPort>({
    key,
    prepareOrderReference: (paymentId: string) => paymentId,
    createPayment: (input: Record<string, unknown>) => {
      gatewayCalls.push(input);
      return Promise.resolve({
        destination: { kind: 'redirect', url: 'https://pay.example/x' },
        ...(options.gatewayTxnId === null
          ? {}
          : { gatewayTxnId: options.gatewayTxnId ?? 'txn-1' }),
        ...(options.gatewayOrderRef === undefined
          ? {}
          : { gatewayOrderRef: options.gatewayOrderRef }),
      });
    },
    providerPaymentMethod: (method: CustomerPaymentMethod) => `PROVIDER_${method.toUpperCase()}`,
  });

  const useCase = new CheckoutUseCase(
    fakePort<IPaymentBookingReader>({
      findById: () => Promise.resolve(options.record === undefined ? booking() : options.record),
    }),
    fakePort<IPaymentRepository>({
      lockCheckoutAttempt: (_tx, bookingId, kind, paymentMethod) => {
        locks.push({ bookingId, kind, paymentMethod });
        return Promise.resolve();
      },
      findReusableCheckoutAttempt: () => {
        if (!options.pending) return Promise.resolve(null);
        const data: CreatePendingCheckoutData = {
          id: options.pending.id,
          bookingId: BOOKING_ID,
          gateway: key,
          kind: 'deposit',
          amount: 500_000n,
          checkoutState: 'creating',
          gatewayConfigRevisionId: `config-${key}`,
          refundStrategySnapshot: 'manual',
          manualRefundSlaHoursSnapshot: 72,
          gatewayOrderRef: options.pending.id,
          paymentMethod: 'PROVIDER_BANK_TRANSFER',
          idempotencyKey: `checkout:${options.pending.id}`,
        };
        return Promise.resolve({
          payment: paymentRecord(data, { checkoutState: 'ready' }),
          destination: options.pending.destination,
        } as never);
      },
      findLatestByBooking: () => Promise.resolve(null),
      createPendingCheckout: (_tx, _tenantId, data) => {
        created.push(data);
        return Promise.resolve(paymentRecord(data));
      },
      markCheckoutReady: (_tx, paymentId, data) => {
        readyWrites.push({ paymentId, data });
        return Promise.resolve(true);
      },
      markCheckoutCreateFailed: () => Promise.resolve(true),
    }),
    fakePort<GatewayRegistryPort>({
      resolveActiveForMethod: (_tx, _tenantId, method) => {
        const configured = options.configs ?? [config('sepay', ['bank_transfer', 'napas_qr'])];
        if (configured.length === 0) {
          routedTo.push(undefined);
          return Promise.resolve({
            gateway,
            configRevisionId: null,
            settings: {
              enabledMethods: [],
              refundStrategy: 'manual',
              manualRefundSlaHours: 72,
            } as GatewayPaymentSettings,
          });
        }
        const selected = configured.find(
          (candidate) =>
            candidate.gateway === key && candidate.settings.enabledMethods.includes(method),
        );
        if (!selected) return Promise.reject(new PaymentMethodUnavailable());
        routedTo.push(selected.gateway);
        return Promise.resolve({
          gateway,
          configRevisionId: selected.id,
          settings: selected.settings,
        });
      },
      resolveForPayment: (_tx, payment) =>
        Promise.resolve({
          gateway,
          configRevisionId: payment.gatewayConfigRevisionId,
          settings: {
            enabledMethods: [],
            refundStrategy: 'manual',
            manualRefundSlaHours: 72,
          } as GatewayPaymentSettings,
        }),
    }),
    fakePort<IRefundPolicyRepository>({
      get: () => Promise.resolve({ refundStrategy: 'manual', manualRefundSlaHours: 72 }),
    }),
    fakeCollaborator<ResolveTenantByHostUseCase>({
      execute: () => Promise.resolve({ id: TENANT_ID, live: options.live ?? true }),
    }),
    tenantDb.service,
  );

  return { useCase, tenantDb, created, readyWrites, gatewayCalls, routedTo, locks };
}

describe('CheckoutUseCase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses to take money for a suspended storefront', async () => {
    const { useCase, tenantDb } = harness({ live: false });

    await expect(useCase.execute(HOST, BOOKING_ID, 'bank_transfer')).rejects.toBeInstanceOf(
      PaymentStorefrontSuspended,
    );
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('rejects an unknown booking', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(HOST, BOOKING_ID, 'bank_transfer')).rejects.toBeInstanceOf(
      BookingNotFound,
    );
  });

  it('charges the deposit plus the security deposit on the first payment', async () => {
    // The security deposit rides along with the deposit and is refunded on return.
    const { useCase, created } = harness();

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(created[0]).toMatchObject({ amount: 500_000n, kind: 'deposit' });
  });

  it('marks the payment full when the deposit already covers the booking', async () => {
    const { useCase, created } = harness({
      record: booking({ depositAmount: 1_000_000n, finalAmount: 1_000_000n }),
    });

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(created[0]).toMatchObject({ amount: 1_100_000n, kind: 'full' });
  });

  it.each(['cancelled', 'confirmed_but_unknown', 'refunded'])(
    'refuses a deposit payment on a %s booking',
    async (status) => {
      // The deposit guard stays strictly `pending_payment`; widening it would let a
      // cancelled or refunded booking take money.
      const { useCase } = harness({ record: booking({ status: status as never }) });

      await expect(useCase.execute(HOST, BOOKING_ID, 'bank_transfer')).rejects.toBeInstanceOf(
        BookingNotPayable,
      );
    },
  );

  it('charges only what is still owed on a balance payment', async () => {
    // The security deposit was already taken with the deposit payment and must
    // never be charged twice.
    const { useCase, created } = harness({
      record: booking({ status: 'confirmed', paidAmount: 400_000n }),
    });

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(created[0]).toMatchObject({ amount: 600_000n, kind: 'balance' });
  });

  it('refuses a balance payment on a fully paid booking', async () => {
    const { useCase } = harness({
      record: booking({ status: 'confirmed', paidAmount: 1_000_000n }),
    });

    await expect(useCase.execute(HOST, BOOKING_ID, 'bank_transfer')).rejects.toBeInstanceOf(
      NothingLeftToPay,
    );
  });

  it('refuses a method no active gateway serves', async () => {
    const { useCase } = harness({ configs: [config('sepay', ['bank_transfer'])] });

    await expect(useCase.execute(HOST, BOOKING_ID, 'international_card')).rejects.toBeInstanceOf(
      PaymentMethodUnavailable,
    );
  });

  it('routes a wallet method to that wallet gateway', async () => {
    const { useCase, routedTo } = harness({
      configs: [config('sepay', ['bank_transfer']), config('momo', ['momo_wallet'])],
      gatewayKey: 'momo',
    });

    await useCase.execute(HOST, BOOKING_ID, 'momo_wallet');

    expect(routedTo).toEqual(['momo']);
  });

  it('falls back to the registry default when no gateway is configured at all', async () => {
    // Dev/test convenience; the production guard below is what stops it mattering.
    const { useCase, routedTo } = harness({ configs: [], gatewayKey: 'mock' });

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(routedTo).toEqual([undefined]);
  });

  it('snapshots an explicit mock config revision supplied by the registry port', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_MOCK_PAYMENTS', 'true');
    const { useCase, created } = harness({
      configs: [config('mock', ['bank_transfer'])],
      gatewayKey: 'mock',
    });

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(created[0]).toMatchObject({
      gateway: 'mock',
      gatewayConfigRevisionId: 'config-mock',
      refundStrategySnapshot: 'manual',
      manualRefundSlaHoursSnapshot: 72,
    });
  });

  it('refuses the mock gateway in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { useCase } = harness({ configs: [], gatewayKey: 'mock' });

    await expect(useCase.execute(HOST, BOOKING_ID, 'bank_transfer')).rejects.toBeInstanceOf(
      NoActiveGateway,
    );
  });

  it('refuses a MoMo order above the gateway cap', async () => {
    // Capped to the refund limit so every MoMo payment stays refundable in one call.
    const { useCase } = harness({
      record: booking({
        depositAmount: 50_000_001n,
        securityDeposit: 0n,
        finalAmount: 50_000_001n,
      }),
      configs: [config('momo', ['momo_wallet'])],
      gatewayKey: 'momo',
    });

    await expect(useCase.execute(HOST, BOOKING_ID, 'momo_wallet')).rejects.toBeInstanceOf(
      AmountExceedsGatewayLimit,
    );
  });

  it('returns the ready durable attempt instead of opening a second one for the same method', async () => {
    const pending = {
      id: 'payment-existing',
      destination: { kind: 'redirect', url: 'https://old' },
    };
    const { useCase, created, gatewayCalls } = harness({ pending });

    const result = await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(result).toEqual({ paymentId: 'payment-existing', destination: pending.destination });
    expect(created).toEqual([]);
    expect(gatewayCalls).toEqual([]);
  });

  it("sends the customer back to the tenant's own host, not a global storefront", async () => {
    // Each tenant serves on its own domain, so the return URLs have to be built
    // from the Host the customer is actually on.
    const { useCase, gatewayCalls } = harness();

    await useCase.execute('bookingstad.localhost', BOOKING_ID, 'bank_transfer');

    expect(gatewayCalls[0]).toMatchObject({
      returnUrl: `http://bookingstad.localhost/bookings/${CODE}?payment=success`,
      errorUrl: `http://bookingstad.localhost/bookings/${CODE}?payment=error`,
      cancelUrl: `http://bookingstad.localhost/bookings/${CODE}?payment=cancel`,
    });
  });

  it.each(['not a host', 'evil.com/path', 'user:pass@evil.com', 'evil.com?x=1'])(
    'rejects the malformed host %s rather than building a URL from it',
    async (host) => {
      const { useCase } = harness();

      await expect(useCase.execute(host, BOOKING_ID, 'bank_transfer')).rejects.toBeInstanceOf(
        InvalidStorefrontHost,
      );
    },
  );

  it('persists a stable attempt identity before the provider reports a reference', async () => {
    const { useCase, created, readyWrites, gatewayCalls, locks } = harness({
      gatewayOrderRef: 'PROVIDER-REF-9',
    });

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    const attempt = created[0];
    expect(attempt).toBeDefined();
    expect(attempt).toMatchObject({
      checkoutState: 'creating',
      gatewayOrderRef: attempt?.id,
      idempotencyKey: `checkout:${attempt?.id}`,
    });
    expect(gatewayCalls[0]).toMatchObject({
      paymentId: attempt?.id,
      gatewayOrderRef: attempt?.id,
    });
    expect(readyWrites[0]).toMatchObject({
      paymentId: attempt?.id,
      data: { gatewayOrderRef: 'PROVIDER-REF-9' },
    });
    expect(locks).toEqual([
      {
        bookingId: BOOKING_ID,
        kind: 'deposit',
        paymentMethod: 'PROVIDER_BANK_TRANSFER',
      },
    ]);
  });

  it('keeps durable idempotency when the provider only returns a transaction id', async () => {
    const { useCase, created, readyWrites } = harness({ gatewayTxnId: 'txn-1' });

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    const attempt = created[0];
    expect(attempt?.idempotencyKey).toBe(`checkout:${attempt?.id}`);
    expect(readyWrites[0]).toMatchObject({
      paymentId: attempt?.id,
      data: {
        gatewayTxnId: 'txn-1',
        gatewayOrderRef: attempt?.gatewayOrderRef,
      },
    });
  });

  it('keeps the pre-created gateway reference when the provider names neither reference nor transaction', async () => {
    const { useCase, created, readyWrites } = harness({ gatewayTxnId: null });

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    const attempt = created[0];
    expect(attempt?.gatewayOrderRef).toBe(attempt?.id);
    expect(attempt?.idempotencyKey).toBe(`checkout:${attempt?.id}`);
    expect(readyWrites[0]).toMatchObject({
      paymentId: attempt?.id,
      data: { gatewayOrderRef: attempt?.gatewayOrderRef },
    });
  });

  it('persists the provider method and gateway revision before provider I/O', async () => {
    const { useCase, created } = harness();

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(created[0]).toMatchObject({
      gateway: 'sepay',
      gatewayConfigRevisionId: 'config-sepay',
      paymentMethod: 'PROVIDER_BANK_TRANSFER',
    });
  });

  it('uses the explicitly routed bank-transfer provider instead of the first active base config', async () => {
    const { useCase, routedTo } = harness({
      configs: [config('sepay', ['bank_transfer']), config('payos', ['bank_transfer'])],
      gatewayKey: 'payos',
    });

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(routedTo).toEqual(['payos']);
  });

  it('snapshots the current refund policy onto every new durable payment', async () => {
    const { useCase, created } = harness();

    await useCase.execute(HOST, BOOKING_ID, 'bank_transfer');

    expect(created[0]).toMatchObject({
      refundStrategySnapshot: 'manual',
      manualRefundSlaHoursSnapshot: 72,
    });
  });
});