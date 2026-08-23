import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomerPaymentMethod, GatewayPaymentSettings } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type {
  GatewayConfigRecord,
  IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import type { IPaymentMethodRouteRepository } from '../../domain/ports/payment-method-route-repository.port';
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
import { GatewayRegistry } from '../../infrastructure/gateway-registry';
import { MockGatewayAdapter } from '../../infrastructure/gateways/mock-gateway.adapter';
import { CheckoutUseCase } from './checkout.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';

function mockConfig(): GatewayConfigRecord {
  return {
    id: 'config-mock',
    gateway: 'mock',
    environment: 'sandbox',
    credentials: {},
    settings: {
      enabledMethods: ['bank_transfer'],
      refundStrategy: 'manual',
      manualRefundSlaHours: 72,
    } as GatewayPaymentSettings,
  } as unknown as GatewayConfigRecord;
}

function booking(): PaymentBookingRecord {
  return {
    id: BOOKING_ID,
    code: 'BK-MOCK-1',
    status: 'pending_payment',
    bookingMode: 'daily',
    depositAmount: 400_000n,
    securityDeposit: 100_000n,
    finalAmount: 1_000_000n,
    paidAmount: 0n,
  } as PaymentBookingRecord;
}

function paymentRecord(data: CreatePendingCheckoutData): PaymentRecord {
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
  };
}

describe('CheckoutUseCase explicit mock revision', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('snapshots the active explicit mock config revision instead of marking a new payment legacy', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_MOCK_PAYMENTS', 'true');

    const config = mockConfig();
    const created: CreatePendingCheckoutData[] = [];
    const tenantDb = fakeTenantDb();
    const registry = new GatewayRegistry(
      new MockGatewayAdapter(),
      fakePort<IGatewayConfigRepository>({
        findActiveAll: () => Promise.resolve([config]),
        findActiveByGateway: (_tx, _tenantId, gateway) =>
          Promise.resolve(gateway === 'mock' ? config : null),
        findById: (_tx, _tenantId, id) => Promise.resolve(id === config.id ? config : null),
        findByGateway: () => Promise.resolve(config),
      }),
      fakePort<IPaymentMethodRouteRepository>({
        findEnabledByMethod: (_tx, _tenantId, method: CustomerPaymentMethod) =>
          Promise.resolve(
            method === 'bank_transfer' ? { method, gateway: 'mock', enabled: true } : null,
          ),
        hasConfiguredRoutes: () => Promise.resolve(true),
      }),
    );

    const useCase = new CheckoutUseCase(
      fakePort<IPaymentBookingReader>({
        findById: () => Promise.resolve(booking()),
      }),
      fakePort<IPaymentRepository>({
        lockCheckoutAttempt: () => Promise.resolve(),
        findReusableCheckoutAttempt: () => Promise.resolve(null),
        findLatestByBooking: () => Promise.resolve(null),
        createPendingCheckout: (_tx, _tenantId, data) => {
          created.push(data);
          return Promise.resolve(paymentRecord(data));
        },
        markCheckoutReady: () => Promise.resolve(true),
        markCheckoutCreateFailed: () => Promise.resolve(true),
      }),
      registry,
      fakePort<IRefundPolicyRepository>({
        get: () => Promise.resolve({ refundStrategy: 'manual', manualRefundSlaHours: 72 }),
      }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
      }),
      tenantDb.service,
    );

    await useCase.execute('studiohub.localhost', BOOKING_ID, 'bank_transfer');

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      gateway: 'mock',
      gatewayConfigRevisionId: 'config-mock',
      refundStrategySnapshot: 'manual',
      manualRefundSlaHoursSnapshot: 72,
    });
  });
});
