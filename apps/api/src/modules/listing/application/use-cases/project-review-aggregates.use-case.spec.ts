import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IReviewAggregateProjector } from '../../domain/ports/review-aggregate-projector.port';
import { ProjectReviewAggregatesUseCase } from './project-review-aggregates.use-case';

const TENANT_ID = 'tenant-1';

function harness() {
  const projections: Array<{ listingId: string; groupId: string | null }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ProjectReviewAggregatesUseCase(
      fakePort<IReviewAggregateProjector>({
        project: (_tx, listingId, groupId) => {
          projections.push({ listingId, groupId });
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    projections,
  };
}

describe('ProjectReviewAggregatesUseCase', () => {
  it('reprojects the listing and its parent post', async () => {
    // The rating badge is denormalised onto both rows, so a new review has to
    // refresh the group as well as the listing.
    const { useCase, tenantDb, projections } = harness();

    await useCase.execute(TENANT_ID, { listingId: 'listing-1', groupId: 'group-1' });

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(projections).toEqual([{ listingId: 'listing-1', groupId: 'group-1' }]);
  });

  it('normalises a missing group to null', async () => {
    const { useCase, projections } = harness();

    await useCase.execute(TENANT_ID, { listingId: 'listing-1' });

    expect(projections).toEqual([{ listingId: 'listing-1', groupId: null }]);
  });

  it('ignores an event carrying no listing, without opening a transaction', async () => {
    // The outbox payload is shared with events that are not listing-scoped; this
    // handler must be a cheap no-op for those rather than an error.
    const { useCase, tenantDb, projections } = harness();

    await useCase.execute(TENANT_ID, { groupId: 'group-1' });

    expect(tenantDb.openedFor).toEqual([]);
    expect(projections).toEqual([]);
  });
});
