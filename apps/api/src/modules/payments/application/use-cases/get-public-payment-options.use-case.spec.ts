import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CustomerPaymentMethod,
  GatewayKey,
  GatewayPaymentSettings,
  PaymentMethodRoute,
} from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type {
  GatewayConfigRecord,
  IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import type { IPaymentMethodRouteRepository } from '../../domain/ports/payment-method-route-repository.port';
import { PaymentNotConfigured } from '../payment-http-errors';
import { GetPublicPaymentOptionsUseCase } from './get-public-payment-options.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';

const config = (gateway: GatewayKey): GatewayConfigRecord =>
  ({
    id: `config-${gateway}`,
    gateway,
    environment: 'production',
    credentials: {},
    settings: {
      enabledMethods: ['bank_transfer'] as CustomerPaymentMethod[],
      refundStrategy: 'manual',
      manualRefundSlaHours: 72,
    } as GatewayPaymentSettings,
  }) as unknown as GatewayConfigRecord;

const ALL_ROUTES: PaymentMethodRoute[] = [
  { method: 'bank_transfer', gateway: 'payos', enabled: true },
  { method: 'napas_qr', gateway: 'sepay', enabled: true },
  { method: 'international_card', gateway: 'sepay', enabled: true },
  { method: 'momo_wallet', gateway: 'momo', enabled: true },
  { method: 'zalopay_wallet', gateway: 'zalopay', enabled: true },
];

function harness(configs: GatewayConfigRecord[], routes: PaymentMethodRoute[] = []) {
  const tenantDb = fakeTenantDb();
  return new GetPublicPaymentOptionsUseCase(
    fakePort<IGatewayConfigRepository>({ findActiveAll: () => Promise.resolve(configs) }),
    fakeCollaborator<ResolveTenantByHostUseCase>({
      execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
    }),
    tenantDb.service,
    fakePort<IPaymentMethodRouteRepository>({ list: () => Promise.resolve(routes) }),
  );
}

describe('GetPublicPaymentOptionsUseCase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('publishes all five methods when four providers and five explicit routes are effective', async () => {
    const useCase = harness(
      [config('sepay'), config('payos'), config('momo'), config('zalopay')],
      ALL_ROUTES,
    );

    await expect(useCase.execute(HOST)).resolves.toEqual({
      methods: [
        'bank_transfer',
        'napas_qr',
        'international_card',
        'momo_wallet',
        'zalopay_wallet',
      ],
    });
  });

  it('removes a method when its selected provider is inactive instead of falling back', async () => {
    const useCase = harness(
      [config('sepay'), config('momo'), config('zalopay')],
      ALL_ROUTES,
    );

    await expect(useCase.execute(HOST)).resolves.toEqual({
      methods: ['napas_qr', 'international_card', 'momo_wallet', 'zalopay_wallet'],
    });
  });

  it('restores a method when its selected provider reconnects without rewriting the route', async () => {
    const routes = [
      { method: 'bank_transfer', gateway: 'payos', enabled: true },
    ] satisfies PaymentMethodRoute[];

    await expect(harness([config('sepay')], routes).execute(HOST)).rejects.toBeInstanceOf(
      PaymentNotConfigured,
    );
    await expect(harness([config('sepay'), config('payos')], routes).execute(HOST)).resolves.toEqual({
      methods: ['bank_transfer'],
    });
  });

  it('does not expose a disabled explicit route even if that provider is active', async () => {
    const useCase = harness(
      [config('sepay')],
      [{ method: 'bank_transfer', gateway: 'sepay', enabled: false }],
    );

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
  });

  it('treats configured zero-enabled routes as an intentional online-checkout shutdown', async () => {
    vi.stubEnv('ALLOW_MOCK_PAYMENTS', 'true');
    vi.stubEnv('NODE_ENV', 'development');

    const useCase = harness(
      [],
      [{ method: 'bank_transfer', gateway: 'sepay', enabled: false }],
    );

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
  });

  it('requires an active mock provider connection for an explicit mock route', async () => {
    vi.stubEnv('ALLOW_MOCK_PAYMENTS', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    const routes = [
      { method: 'bank_transfer', gateway: 'mock', enabled: true },
    ] satisfies PaymentMethodRoute[];

    await expect(harness([], routes).execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
    await expect(harness([config('mock')], routes).execute(HOST)).resolves.toEqual({
      methods: ['bank_transfer'],
    });
  });

  it('offers local mock only when the tenant is truly unconfigured and explicitly opted in', async () => {
    vi.stubEnv('ALLOW_MOCK_PAYMENTS', 'true');
    vi.stubEnv('NODE_ENV', 'development');

    await expect(harness([], []).execute(HOST)).resolves.toEqual({ methods: ['bank_transfer'] });

    vi.stubEnv('NODE_ENV', 'production');
    await expect(harness([], []).execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
  });

  it('prefers an explicit effective real route over local mock fallback', async () => {
    vi.stubEnv('ALLOW_MOCK_PAYMENTS', 'true');
    vi.stubEnv('NODE_ENV', 'development');

    const useCase = harness(
      [config('sepay')],
      [{ method: 'napas_qr', gateway: 'sepay', enabled: true }],
    );

    await expect(useCase.execute(HOST)).resolves.toEqual({ methods: ['napas_qr'] });
  });
});
