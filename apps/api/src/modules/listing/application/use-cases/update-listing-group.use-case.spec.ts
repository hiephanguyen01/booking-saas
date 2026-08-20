import { describe, expect, it } from 'vitest';
import type { UpdateListingGroupInput } from '@booking/contracts';
import { fakeCollaborator, fakeTenantDb } from '~testing';
import type { ListingGroupRecord } from '../../domain/ports/listing-group-repository.port';
import type { ApplyListingGroupUpdateUseCase } from './apply-listing-group-update.use-case';
import { UpdateListingGroupUseCase } from './update-listing-group.use-case';

const TENANT_ID = 'tenant-1';
const GROUP_ID = 'group-1';

describe('UpdateListingGroupUseCase', () => {
  it('applies the update in ONE transaction and passes the scope through', async () => {
    const calls: unknown[] = [];
    const updated = { id: GROUP_ID } as unknown as ListingGroupRecord;
    const tenantDb = fakeTenantDb();
    const useCase = new UpdateListingGroupUseCase(
      fakeCollaborator<ApplyListingGroupUpdateUseCase>({
        execute: (...args: unknown[]) => {
          calls.push(args.slice(1));
          return Promise.resolve(updated);
        },
      }),
      tenantDb.service,
    );

    const input = { title: 'Khách sạn A' } as UpdateListingGroupInput;
    await expect(useCase.execute(TENANT_ID, GROUP_ID, input)).resolves.toBe(updated);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([[TENANT_ID, GROUP_ID, input, {}]]);
  });
});
