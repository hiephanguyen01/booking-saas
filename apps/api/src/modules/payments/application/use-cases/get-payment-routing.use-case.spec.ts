import { describe, expect, it } from 'vitest';
import type { PaymentMethodRoute } from '@booking/contracts';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { IPaymentMethodRouteRepository } from '../../domain/ports/payment-method-route-repository.port';
import { GetPaymentRoutingUseCase } from './get-payment-routing.use-case';

const TENANT_ID = 'tenant-1';

describe('GetPaymentRoutingUseCase', () => {
  it('returns tenant routes in customer payment-method order', async () => {
    const tenantDb = fakeTenantDb();
    const stored: PaymentMethodRoute[] = [
      { method: 'momo_wallet', gateway: 'momo', enabled: true },
      { method: 'bank_transfer', gateway: 'payos', enabled: true },
      { method: 'napas_qr', gateway: 'sepay', enabled: false },
    ];
    const useCase = new GetPaymentRoutingUseCase(
      fakePort<IPaymentMethodRouteRepository>({ list: () => Promise.resolve(stored) }),
      fakeTenantContext(TENANT_ID),
      tenantDb.service,
    );

    await expect(useCase.execute()).resolves.toEqual({
      routes: [
        { method: 'bank_transfer', gateway: 'payos', enabled: true },
        { method: 'napas_qr', gateway: 'sepay', enabled: false },
        { method: 'momo_wallet', gateway: 'momo', enabled: true },
      ],
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });
});
