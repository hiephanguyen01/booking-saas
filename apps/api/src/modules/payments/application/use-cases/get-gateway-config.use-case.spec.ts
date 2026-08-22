import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { IGatewayConfigRepository } from '../../domain/ports/gateway-config-repository.port';
import { GetGatewayConfigUseCase } from './get-gateway-config.use-case';

const TENANT_ID = 'tenant-1';

describe('GetGatewayConfigUseCase', () => {
  it('reads every ACTIVE gateway of the caller tenant, in one transaction', async () => {
    // Active only: an inactive config still holds credentials, and the settings
    // screen must not present a gateway checkout would refuse.
    const asked: string[] = [];
    const configs = [{ id: 'config-1' }];
    const tenantDb = fakeTenantDb();
    const useCase = new GetGatewayConfigUseCase(
      fakePort<IGatewayConfigRepository>({
        findActiveAll: (_tx, tenantId) => {
          asked.push(tenantId);
          return Promise.resolve(configs as never);
        },
      }),
      fakeTenantContext(TENANT_ID),
      tenantDb.service,
    );

    await expect(useCase.execute()).resolves.toBe(configs);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(asked).toEqual([TENANT_ID]);
  });
});
