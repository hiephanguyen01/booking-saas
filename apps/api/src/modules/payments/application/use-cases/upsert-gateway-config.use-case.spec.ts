import { describe, expect, it } from 'vitest';
import type { UpsertGatewayConfigInput } from '@booking/contracts';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { IGatewayConfigRepository } from '../../domain/ports/gateway-config-repository.port';
import { InvalidGatewayConfig } from '../payment-http-errors';
import { UpsertGatewayConfigUseCase } from './upsert-gateway-config.use-case';

const TENANT_ID = 'tenant-1';

function harness() {
  const upserts: Array<{ tenantId: string; data: unknown }> = [];
  const tenantDb = fakeTenantDb();
  const useCase = new UpsertGatewayConfigUseCase(
    fakePort<IGatewayConfigRepository>({
      upsert: (_tx, tenantId, data) => {
        upserts.push({ tenantId, data });
        return Promise.resolve({ id: 'config-1' } as never);
      },
    }),
    fakeTenantContext(TENANT_ID),
    tenantDb.service,
  );
  return { useCase, tenantDb, upserts };
}

describe('UpsertGatewayConfigUseCase', () => {
  it('stores a valid config against the caller tenant', async () => {
    const { useCase, tenantDb, upserts } = harness();
    const input = {
      gateway: 'sepay',
      environment: 'production',
      credentials: { merchantId: 'MERCHANT-1', secretKey: '0123456789abcdef' },
    } as unknown as UpsertGatewayConfigInput;

    await useCase.execute(input);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(upserts[0]?.tenantId).toBe(TENANT_ID);
  });

  it('re-validates the input rather than trusting the controller', () => {
    // Credentials are gateway-specific and encrypted at rest; a shape the schema
    // rejects would be stored as an unusable blob and only fail at checkout.
    //
    // Asserted synchronously on purpose: `execute` is not an `async` method, so
    // the validation runs before the promise exists and this throws rather than
    // rejecting. Every caller is a Nest handler that awaits inside its own try,
    // so nothing observable changes — but a test written with `.rejects` would
    // pass vacuously.
    const { useCase, upserts } = harness();

    expect(() =>
      useCase.execute({ gateway: 'not-a-gateway' } as unknown as UpsertGatewayConfigInput),
    ).toThrow(InvalidGatewayConfig);
    expect(upserts).toEqual([]);
  });

  it('stores the parsed value, not the raw input', async () => {
    // `safeParse` strips unknown keys; persisting the raw object would smuggle
    // them into the encrypted credential blob.
    const { useCase, upserts } = harness();

    await useCase.execute({
      gateway: 'sepay',
      environment: 'production',
      credentials: { merchantId: 'MERCHANT-1', secretKey: '0123456789abcdef' },
      sneaky: 'value',
    } as unknown as UpsertGatewayConfigInput);

    expect(upserts[0]?.data).not.toHaveProperty('sneaky');
  });
});
