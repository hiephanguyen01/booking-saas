import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ICancellationPolicyRepository } from '../../domain/ports/cancellation-policy-repository.port';
import { ListCancellationPoliciesUseCase } from './list-cancellation-policies.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

const policy = (id: string, partnerId: string | null) =>
  ({
    id,
    partnerId,
    tenantId: TENANT_ID,
    name: id,
    rules: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }) as never;

describe('ListCancellationPoliciesUseCase', () => {
  it('marks the partner default among their own and the shared tenant policies', async () => {
    // A partner may attach either kind, so both come back in one list — with the
    // partner's own default flagged, not the tenant's.
    const tenantDb = fakeTenantDb();
    const useCase = new ListCancellationPoliciesUseCase(
      fakePort<ICancellationPolicyRepository>({
        listForPartner: () =>
          Promise.resolve([policy('own', PARTNER_ID), policy('shared', null)] as never),
        findPartnerDefaultId: () => Promise.resolve('own'),
      }),
      tenantDb.service,
    );

    const rows = await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(rows.map((row) => [row.id, row.isDefault])).toEqual([
      ['own', true],
      ['shared', false],
    ]);
  });
});
