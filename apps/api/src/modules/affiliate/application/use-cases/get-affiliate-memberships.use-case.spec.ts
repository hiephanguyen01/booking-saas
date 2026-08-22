import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type {
  AffiliateWithUser,
  IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';
import { GetAffiliateMembershipsUseCase } from './get-affiliate-memberships.use-case';

const ROWS = [{ id: 'aff-1', tenantId: 'tenant-1' }] as unknown as AffiliateWithUser[];

describe('GetAffiliateMembershipsUseCase', () => {
  it('reads the memberships of the calling user', async () => {
    // Every affiliate surface is scoped from this; answering for another user
    // would hand over their tenants.
    const asked: string[] = [];
    const useCase = new GetAffiliateMembershipsUseCase(
      fakePort<IAffiliateReader>({
        adminFindMembershipsByUser: (userId) => {
          asked.push(userId);
          return Promise.resolve(ROWS);
        },
      }),
    );

    await expect(useCase.execute('user-1')).resolves.toBe(ROWS);
    expect(asked).toEqual(['user-1']);
  });
});
