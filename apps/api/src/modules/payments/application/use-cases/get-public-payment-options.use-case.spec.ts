import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomerPaymentMethod, GatewayKey, GatewayPaymentSettings } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type {
  GatewayConfigRecord,
  IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
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

function harness(configs: GatewayConfigRecord[]) {
  const tenantDb = fakeTenantDb();
  return new GetPublicPaymentOptionsUseCase(
    fakePort<IGatewayConfigRepository>({ findActiveAll: () => Promise.resolve(configs) }),
    fakeCollaborator<ResolveTenantByHostUseCase>({
      execute: () => Promise.resolve({ id: TENANT_ID, live: true }),
    }),
    tenantDb.service,
  );
}

describe('GetPublicPaymentOptionsUseCase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('offers only the methods an active gateway can actually process', async () => {
    // The intersection of what the tenant enabled and what the gateway supports —
    // offering a method the provider cannot take is a dead end at checkout.
    const useCase = harness([
      config('sepay', ['bank_transfer', 'napas_qr', 'momo_wallet']),
      config('momo', ['momo_wallet']),
    ]);

    await expect(useCase.execute(HOST)).resolves.toEqual({
      methods: ['bank_transfer', 'napas_qr', 'momo_wallet'],
    });
  });

  it('drops a method the tenant enabled on a gateway that cannot serve it', async () => {
    // SePay does not process wallet payments; without the MoMo config above, the
    // enabled `momo_wallet` must not be offered.
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
});
