import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { ApprovedAffiliateRequired } from '../../domain/errors/affiliate-errors';
import type {
  AffiliateWithUser,
  IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';
import { RequireApprovedAffiliateUseCase } from './require-approved-affiliate.use-case';

const membership = (id: string, tenantId: string, status: string): AffiliateWithUser =>
  ({ id, tenantId, status, userId: 'user-1' }) as unknown as AffiliateWithUser;

function harness(memberships: AffiliateWithUser[]) {
  return new RequireApprovedAffiliateUseCase(
    fakePort<IAffiliateReader>({
      adminFindMembershipsByUser: () => Promise.resolve(memberships),
    }),
  );
}

describe('RequireApprovedAffiliateUseCase', () => {
  it('REFUSES a pending or suspended affiliate', async () => {
    // This gate protects the earning surface: minting links and reading
    // commissions needs an approved membership, not merely an application.
    const useCase = harness([
      membership('aff-pending', 'tenant-1', 'pending'),
      membership('aff-suspended', 'tenant-2', 'suspended'),
    ]);

    await expect(useCase.execute('user-1')).rejects.toBeInstanceOf(
      ApprovedAffiliateRequired,
    );
  });

  it('refuses a user who is an affiliate nowhere', async () => {
    const useCase = harness([]);

    await expect(useCase.execute('user-1')).rejects.toBeInstanceOf(
      ApprovedAffiliateRequired,
    );
  });

  it('picks the first APPROVED membership when no tenant was asked for', async () => {
    const useCase = harness([
      membership('aff-pending', 'tenant-1', 'pending'),
      membership('aff-approved', 'tenant-2', 'approved'),
    ]);

    await expect(useCase.execute('user-1')).resolves.toEqual({
      affiliateId: 'aff-approved',
      tenantId: 'tenant-2',
    });
  });

  it('refuses a requested tenant where the membership is not approved', async () => {
    // Falling through to another tenant's approved membership would let a
    // suspended affiliate act under a tenant they were suspended from.
    const useCase = harness([
      membership('aff-approved', 'tenant-1', 'approved'),
      membership('aff-suspended', 'tenant-2', 'suspended'),
    ]);

    await expect(useCase.execute('user-1', 'tenant-2')).rejects.toBeInstanceOf(
      ApprovedAffiliateRequired,
    );
  });

  it('honours a requested tenant that IS approved', async () => {
    const useCase = harness([
      membership('aff-a', 'tenant-1', 'approved'),
      membership('aff-b', 'tenant-2', 'approved'),
    ]);

    await expect(useCase.execute('user-1', 'tenant-2')).resolves.toMatchObject({
      affiliateId: 'aff-b',
    });
  });
});
