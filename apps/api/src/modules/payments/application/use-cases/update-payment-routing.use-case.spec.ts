import { describe, expect, it } from 'vitest';
import type { PaymentMethodRoute, PaymentRoutingInput } from '@booking/contracts';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { IGatewayConfigRepository } from '../../domain/ports/gateway-config-repository.port';
import type { PaymentConfigurationLockPort } from '../../domain/ports/payment-configuration-lock.port';
import type { IPaymentMethodRouteRepository } from '../../domain/ports/payment-method-route-repository.port';
import { InvalidPaymentRouting, PaymentRoutingProviderInactive } from '../payment-http-errors';
import { UpdatePaymentRoutingUseCase } from './update-payment-routing.use-case';

const TENANT_ID = 'tenant-1';

function harness(activeGateways: Array<'sepay' | 'payos' | 'momo' | 'zalopay' | 'mock'>) {
  const tenantDb = fakeTenantDb();
  const calls: string[] = [];
  const replacements: PaymentMethodRoute[][] = [];
  const useCase = new UpdatePaymentRoutingUseCase(
    fakePort<IPaymentMethodRouteRepository>({
      replaceAll: (_tx, _tenantId, routes) => {
        calls.push('replace');
        replacements.push(routes);
        return Promise.resolve(routes);
      },
    }),
    fakePort<IGatewayConfigRepository>({
      findActiveAll: () => {
        calls.push('active');
        return Promise.resolve(
          activeGateways.map((gateway, index) => ({
            id: `cfg-${index}`,
            gateway,
            environment: 'sandbox',
            credentials: {},
            settings: { enabledMethods: ['bank_transfer'], refundStrategy: 'manual', manualRefundSlaHours: 72 },
          })) as never,
        );
      },
    }),
    fakePort<PaymentConfigurationLockPort>({
      acquire: () => {
        calls.push('lock');
        return Promise.resolve();
      },
    }),
    fakeTenantContext(TENANT_ID),
    tenantDb.service,
  );
  return { useCase, calls, replacements, tenantDb };
}

describe('UpdatePaymentRoutingUseCase', () => {
  it('locks, validates active providers and atomically replaces the full route set', async () => {
    const { useCase, calls, replacements, tenantDb } = harness(['sepay', 'payos', 'momo', 'zalopay']);
    const input: PaymentRoutingInput = {
      routes: [
        { method: 'bank_transfer', gateway: 'payos', enabled: true },
        { method: 'napas_qr', gateway: 'sepay', enabled: true },
        { method: 'international_card', gateway: 'sepay', enabled: true },
        { method: 'momo_wallet', gateway: 'momo', enabled: true },
        { method: 'zalopay_wallet', gateway: 'zalopay', enabled: true },
      ],
    };

    await expect(useCase.execute(input)).resolves.toEqual({ routes: input.routes });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual(['lock', 'active', 'replace']);
    expect(replacements).toEqual([input.routes]);
  });

  it('rejects duplicate and capability-invalid routes before opening a tenant transaction', () => {
    const duplicate = harness(['sepay']);
    expect(() =>
      duplicate.useCase.execute({
        routes: [
          { method: 'bank_transfer', gateway: 'sepay', enabled: true },
          { method: 'bank_transfer', gateway: 'sepay', enabled: false },
        ],
      } as PaymentRoutingInput),
    ).toThrow(InvalidPaymentRouting);
    expect(duplicate.tenantDb.openedFor).toEqual([]);

    const unsupported = harness(['payos']);
    expect(() =>
      unsupported.useCase.execute({
        routes: [{ method: 'napas_qr', gateway: 'payos', enabled: true }],
      } as PaymentRoutingInput),
    ).toThrow(InvalidPaymentRouting);
    expect(unsupported.tenantDb.openedFor).toEqual([]);
  });

  it('allows disabled routes to inactive providers but rejects enabled ones', async () => {
    const disabled = harness([]);
    await expect(
      disabled.useCase.execute({
        routes: [{ method: 'bank_transfer', gateway: 'payos', enabled: false }],
      }),
    ).resolves.toEqual({
      routes: [{ method: 'bank_transfer', gateway: 'payos', enabled: false }],
    });

    const enabled = harness([]);
    await expect(
      enabled.useCase.execute({
        routes: [{ method: 'bank_transfer', gateway: 'payos', enabled: true }],
      }),
    ).rejects.toBeInstanceOf(PaymentRoutingProviderInactive);
  });

  it('accepts an empty replacement', async () => {
    const { useCase, replacements } = harness([]);
    await expect(useCase.execute({ routes: [] })).resolves.toEqual({ routes: [] });
    expect(replacements).toEqual([[]]);
  });
});
