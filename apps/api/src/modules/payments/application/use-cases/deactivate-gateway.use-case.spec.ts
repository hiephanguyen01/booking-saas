import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { IGatewayConfigRepository } from '../../domain/ports/gateway-config-repository.port';
import { DeactivateGatewayUseCase } from './deactivate-gateway.use-case';

const TENANT_ID = 'tenant-1';

function harness() {
  const calls: Array<{ tenantId: string; gateway: string | undefined }> = [];
  const tenantDb = fakeTenantDb();
  const useCase = new DeactivateGatewayUseCase(
    fakePort<IGatewayConfigRepository>({
      deactivate: (_tx, tenantId, gateway) => {
        calls.push({ tenantId, gateway });
        return Promise.resolve();
      },
    }),
    fakeTenantContext(TENANT_ID),
    tenantDb.service,
  );
  return { useCase, tenantDb, calls };
}

describe('DeactivateGatewayUseCase', () => {
  it('turns off one named gateway for the caller tenant', async () => {
    const { useCase, tenantDb, calls } = harness();

    await useCase.execute('momo');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([{ tenantId: TENANT_ID, gateway: 'momo' }]);
  });

  it('turns off every active gateway when none is named', async () => {
    // Base and wallets alike — "Tắt" with no argument is the kill switch.
    const { useCase, calls } = harness();

    await useCase.execute();

    expect(calls).toEqual([{ tenantId: TENANT_ID, gateway: undefined }]);
  });
});
