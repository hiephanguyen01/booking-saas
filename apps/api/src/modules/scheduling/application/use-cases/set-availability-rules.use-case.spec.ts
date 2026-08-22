import { describe, expect, it } from 'vitest';
import type { AvailabilityRuleInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { ListingNotFound } from '../../../listing/domain/errors/listing-errors';
import type { IListingRepository } from '../../../listing/domain/ports/listing-repository.port';
import { ListingNotOwnedForAvailability } from '../../domain/errors/availability-errors';
import type { IAvailabilityCache } from '../../domain/ports/availability-cache.port';
import type { IAvailabilityRuleRepository } from '../../domain/ports/availability-rule-repository.port';
import { SetAvailabilityRulesUseCase } from './set-availability-rules.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const RESOURCE_ID = 'resource-1';
const PARTNER_ID = 'partner-1';

const listing = (partnerId = PARTNER_ID) =>
  ({ id: LISTING_ID, partnerId, resourceId: RESOURCE_ID }) as never;

function harness(found: unknown) {
  const effects: string[] = [];
  const invalidated: string[] = [];
  const replacements: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new SetAvailabilityRulesUseCase(
      fakePort<IListingRepository>({ findById: () => Promise.resolve(found as never) }),
      fakePort<IAvailabilityRuleRepository>({
        replaceForListing: (_tx, _tenantId, _listingId, rules) => {
          effects.push('replace');
          replacements.push(rules);
          return Promise.resolve(rules as never);
        },
      }),
      tenantDb.service,
      fakePort<IAvailabilityCache>({
        invalidateResource: (resourceId) => {
          effects.push('invalidate');
          invalidated.push(resourceId);
          return Promise.resolve();
        },
      }),
    ),
    tenantDb,
    effects,
    invalidated,
    replacements,
  };
}

const rules = [
  { dayOfWeek: 1, openTime: '08:00', closeTime: '22:00' },
] as unknown as AvailabilityRuleInput[];

describe('SetAvailabilityRulesUseCase', () => {
  it('answers 404 for a listing that does not exist', async () => {
    const { useCase, effects } = harness(null);

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, LISTING_ID, rules),
    ).rejects.toBeInstanceOf(ListingNotFound);
    expect(effects).toEqual([]);
  });

  it("answers 403 for another partner's listing", async () => {
    const { useCase, effects } = harness(listing('partner-2'));

    await expect(
      useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, LISTING_ID, rules),
    ).rejects.toBeInstanceOf(ListingNotOwnedForAvailability);
    expect(effects).toEqual([]);
  });

  it('replaces the whole rule set, then invalidates the RESOURCE cache', async () => {
    // Availability is cached per resource, not per listing: several listings can
    // share one resource, and all of their slot caches go stale together.
    const { useCase, tenantDb, effects, invalidated } = harness(listing());

    await useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, LISTING_ID, rules);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(effects).toEqual(['replace', 'invalidate']);
    expect(invalidated).toEqual([RESOURCE_ID]);
  });

  it('accepts an empty rule set as "no weekly opening at all"', async () => {
    const { useCase, replacements } = harness(listing());

    await useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID }, LISTING_ID, []);

    expect(replacements).toEqual([[]]);
  });
});
