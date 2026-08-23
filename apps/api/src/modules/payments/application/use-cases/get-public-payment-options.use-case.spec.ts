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

function harness(
  configs: GatewayConfigRecord[],
  routes: PaymentMethodRoute[] = [],
  hasConfiguredRoutes = routes.length > 0,
) {
  const tenantDb = fakeTenantDb();
  const configsPort = fakePort<IGatewayConfigRepository>({
    findActiveAll: () => Promise.resolve(configs),
  });
  const routesPort = fakePort<IPaymentMethodRouteRepository>({
    hasConfiguredRoutes: () => Promise.resolve(hasConfiguredRoutes),
    listEffective: (_tx, _tenantId, activeGateways) =>
      Promise.resolve(
        routes.filter((route) => route.enabled && activeGateways.has(route.gateway)),
      ),
  });
  const resolveTenant = fakeCollaborator<ResolveTenantByHostUseCase>({
    execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
  });

  // Reflect keeps this tests-only RED compatible with both the old 3-arg constructor
  // and the new route-repository dependency introduced by the implementation.
  return Reflect.construct(GetPublicPaymentOptionsUseCase, [
    configsPort,
    resolveTenant,
    tenantDb.service,
    routesPort,
  ]) as GetPublicPaymentOptionsUseCase;
}

describe('GetPublicPaymentOptionsUseCase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('offers only the methods an active gateway can actually process', async () => {
    const useCase = harness([
      config('sepay', ['bank_transfer', 'napas_qr', 'momo_wallet']),
      config('momo', ['momo_wallet']),
    ]);

    await expect(useCase.execute(HOST)).resolves.toEqual({
      methods: ['bank_transfer', 'napas_qr', 'momo_wallet'],
    });
  });

  it('drops a method the tenant enabled on a gateway that cannot serve it', async () => {
    const useCase = harness([config('sepay', ['bank_transfer', 'momo_wallet'])]);

    await expect(useCase.execute(HOST)).resolves.toEqual({ methods: ['bank_transfer'] });
  });

  it('refuses when the tenant has configured nothing', async () => {
    const useCase = harness([]);

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
  });

  it('refuses when every configured gateway serves nothing enabled', async () => {
    const useCase = harness([config('momo', ['bank_transfer'])]);

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
  });

  it('offers the mock methods only outside production, and only when opted in', async () => {
    vi.stubEnv('ALLOW_MOCK_PAYMENTS', 'true');
    vi.stubEnv('NODE_ENV', 'development');

    await expect(harness([]).execute(HOST)).resolves.toEqual({ methods: ['bank_transfer'] });

    vi.stubEnv('NODE_ENV', 'production');
    await expect(harness([]).execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
  });

  it('does not expose a legacy-enabled method when its explicit route is disabled', async () => {
    const useCase = harness(
      [config('sepay', ['bank_transfer'])],
      [{ method: 'bank_transfer', gateway: 'sepay', enabled: false }],
      true,
    );

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
  });

  it('does not fall back to another active provider when the routed provider is inactive', async () => {
    const useCase = harness(
      [config('sepay', ['bank_transfer'])],
      [{ method: 'bank_transfer', gateway: 'payos', enabled: true }],
      true,
    );

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
  });

  it('treats configured zero-enabled routes as an intentional online-checkout shutdown', async () => {
    vi.stubEnv('ALLOW_MOCK_PAYMENTS', 'true');
    vi.stubEnv('NODE_ENV', 'development');

    const useCase = harness(
      [],
      [{ method: 'bank_transfer', gateway: 'sepay', enabled: false }],
      true,
    );

    await expect(useCase.execute(HOST)).rejects.toBeInstanceOf(PaymentNotConfigured);
  });
});
