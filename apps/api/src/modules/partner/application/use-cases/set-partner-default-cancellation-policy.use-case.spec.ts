import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import {
  CancellationPolicyNotFound,
  PartnerNotFound,
} from '../../domain/errors/partner-errors';
import type { IPartnerReader } from '../../domain/ports/partner-reader.port';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { SetPartnerDefaultCancellationPolicyUseCase } from './set-partner-default-cancellation-policy.use-case';

const PARTNER_ID = 'partner-1';

interface Options {
  tenantId?: string | null;
  visible?: boolean;
}

function harness(options: Options = {}) {
  const writes: unknown[] = [];
  const visibilityChecks: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new SetPartnerDefaultCancellationPolicyUseCase(
      fakePort<IPartnerReader>({
        tenantIdOfPartner: () =>
          Promise.resolve(options.tenantId === undefined ? 'tenant-9' : options.tenantId),
      }),
      fakePort<IPartnerRepository>({
        isCancellationPolicyVisible: (_tx, partnerId, policyId) => {
          visibilityChecks.push({ partnerId, policyId });
          return Promise.resolve(options.visible ?? true);
        },
        updateDefaultCancellationPolicy: (_tx, id, intent) => {
          writes.push(intent);
          return Promise.resolve({ id, ...intent } as unknown as PartnerRecord);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    writes,
    visibilityChecks,
  };
}

describe('SetPartnerDefaultCancellationPolicyUseCase', () => {
  it('answers not-found when the partner belongs to no tenant', async () => {
    const { useCase, writes } = harness({ tenantId: null });

    await expect(useCase.execute(PARTNER_ID, 'policy-1')).rejects.toBeInstanceOf(
      PartnerNotFound,
    );
    expect(writes).toEqual([]);
  });

  it('REFUSES a policy this partner cannot see', async () => {
    // Otherwise a partner could adopt another partner's private policy as its
    // own fallback.
    const { useCase, writes, visibilityChecks } = harness({ visible: false });

    await expect(useCase.execute(PARTNER_ID, 'policy-1')).rejects.toBeInstanceOf(
      CancellationPolicyNotFound,
    );
    expect(visibilityChecks).toEqual([{ partnerId: PARTNER_ID, policyId: 'policy-1' }]);
    expect(writes).toEqual([]);
  });

  it('sets a visible policy', async () => {
    const { useCase, writes, tenantDb } = harness();

    await useCase.execute(PARTNER_ID, 'policy-1');

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
    expect(writes).toEqual([{ defaultCancellationPolicyId: 'policy-1' }]);
  });

  it('CLEARS the default without a visibility check', async () => {
    const { useCase, writes, visibilityChecks } = harness({ visible: false });

    await useCase.execute(PARTNER_ID, null);

    expect(visibilityChecks).toEqual([]);
    expect(writes).toEqual([{ defaultCancellationPolicyId: null }]);
  });
});
