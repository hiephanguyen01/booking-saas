import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ReferralLinkState } from '../../domain/entities/referral-link.entity';
import {
  ReferralLinkNotFound,
  ReferralLinkNotOwned,
} from '../../domain/errors/affiliate-errors';
import type { IReferralLinkRepository } from '../../domain/ports/referral-link-repository.port';
import { DeleteReferralLinkUseCase } from './delete-referral-link.use-case';

const TENANT_ID = 'tenant-1';
const AFFILIATE_ID = 'affiliate-1';
const LINK_ID = 'link-1';

const state = (affiliateId = AFFILIATE_ID): ReferralLinkState =>
  ({ id: LINK_ID, affiliateId }) as ReferralLinkState;

function harness(found: ReferralLinkState | null = state()) {
  const deleted: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DeleteReferralLinkUseCase(
      fakePort<IReferralLinkRepository>({
        loadById: () => Promise.resolve(found),
        delete: (_tx, id) => {
          deleted.push(id);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    deleted,
  };
}

describe('DeleteReferralLinkUseCase', () => {
  it('answers not-found for an unknown link', async () => {
    const { useCase, deleted } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, AFFILIATE_ID, LINK_ID),
    ).rejects.toBeInstanceOf(ReferralLinkNotFound);
    expect(deleted).toEqual([]);
  });

  it("refuses ANOTHER affiliate's link inside the same tenant", async () => {
    // RLS scopes the tenant but not the affiliate, so this check is the only
    // thing between two affiliates of one tenant.
    const { useCase, deleted } = harness(state('affiliate-2'));

    await expect(
      useCase.execute(TENANT_ID, AFFILIATE_ID, LINK_ID),
    ).rejects.toBeInstanceOf(ReferralLinkNotOwned);
    expect(deleted).toEqual([]);
  });

  it('deletes the affiliate’s own link', async () => {
    const { useCase, deleted, tenantDb } = harness();

    await useCase.execute(TENANT_ID, AFFILIATE_ID, LINK_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(deleted).toEqual([LINK_ID]);
  });
});
