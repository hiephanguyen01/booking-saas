import { describe, expect, it } from 'vitest';
import type { UpdateListingInput } from '@booking/contracts';
import { fakeCollaborator, fakeTenantDb } from '~testing';
import type { ListingRecord } from '../../domain/ports/listing-repository.port';
import type { ApplyListingUpdateUseCase } from './apply-listing-update.use-case';
import { UpdateListingUseCase } from './update-listing.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';

describe('UpdateListingUseCase', () => {
  it('applies the update in ONE transaction and passes the scope through', async () => {
    // This is the direct-write path — for a listing that was never reviewed, and
    // for tenant-side edits. A partner editing a reviewed listing goes through
    // SaveListingEdit instead, which parks the change (ADR 0007).
    const calls: unknown[] = [];
    const updated = { id: LISTING_ID } as unknown as ListingRecord;
    const tenantDb = fakeTenantDb();
    const useCase = new UpdateListingUseCase(
      fakeCollaborator<ApplyListingUpdateUseCase>({
        execute: (...args: unknown[]) => {
          calls.push(args.slice(1));
          return Promise.resolve(updated);
        },
      }),
      tenantDb.service,
    );

    const input = { title: 'Studio A' } as UpdateListingInput;
    await expect(
      useCase.execute(TENANT_ID, LISTING_ID, input, { requirePartnerId: 'partner-1' }),
    ).resolves.toBe(updated);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([[TENANT_ID, LISTING_ID, input, { requirePartnerId: 'partner-1' }]]);
  });
});
