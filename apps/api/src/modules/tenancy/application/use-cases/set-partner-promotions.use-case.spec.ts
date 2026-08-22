import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../domain/ports/tenant-repository.port';
import { SetPartnerPromotionsUseCase } from './set-partner-promotions.use-case';

const TENANT_ID = 'tenant-1';

const tenant = (settings: Record<string, unknown>) =>
  ({ id: TENANT_ID, status: 'active', settings, defaultCancellationPolicyId: null }) as TenantRecord;

function harness(found: TenantRecord | null = tenant({ theme: 'dark', maxPhotos: 8 })) {
  const patches: Record<string, unknown>[] = [];
  return {
    useCase: new SetPartnerPromotionsUseCase(
      fakePort<ITenantRepository>({
        findById: () => Promise.resolve(found),
        update: (id, patch) => {
          patches.push(patch as Record<string, unknown>);
          return Promise.resolve({ id, ...patch } as TenantRecord);
        },
      }),
    ),
    patches,
  };
}

describe('SetPartnerPromotionsUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase, patches } = harness(null);

    await expect(useCase.execute(TENANT_ID, true)).rejects.toBeInstanceOf(TenantNotFound);
    expect(patches).toEqual([]);
  });

  it('PRESERVES the rest of settings while flipping the flag', async () => {
    // `settings` is one jsonb column, so writing the flag alone would blank
    // every other setting the tenant has.
    const { useCase, patches } = harness();

    await useCase.execute(TENANT_ID, true);

    expect(patches).toEqual([
      { settings: { theme: 'dark', maxPhotos: 8, partnerPromotionsEnabled: true } },
    ]);
  });

  it('turns the flag off as readily as on', async () => {
    const { useCase, patches } = harness(tenant({ partnerPromotionsEnabled: true }));

    await useCase.execute(TENANT_ID, false);

    expect(patches).toEqual([{ settings: { partnerPromotionsEnabled: false } }]);
  });
});
