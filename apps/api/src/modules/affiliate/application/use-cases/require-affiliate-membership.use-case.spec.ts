import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import { AffiliateMembershipRequired } from '../../domain/errors/affiliate-errors';
import type {
  AffiliateWithUser,
  IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';
import { RequireAffiliateMembershipUseCase } from './require-affiliate-membership.use-case';

const membership = (
  id: string,
  tenantId: string,
  status: string,
): AffiliateWithUser =>
  ({ id, tenantId, status, userId: 'user-1' }) as unknown as AffiliateWithUser;

function harness(memberships: AffiliateWithUser[]) {
  const asked: string[] = [];
  return {
    useCase: new RequireAffiliateMembershipUseCase(
      fakePort<IAffiliateReader>({
        adminFindMembershipsByUser: (userId) => {
          asked.push(userId);
          return Promise.resolve(memberships);
        },
      }),
    ),
    asked,
  };
}

describe('RequireAffiliateMembershipUseCase', () => {
  it('refuses a user who is an affiliate nowhere', async () => {
    const { useCase } = harness([]);

    await expect(useCase.execute('user-1')).rejects.toBeInstanceOf(
      AffiliateMembershipRequired,
    );
  });

  it('PREFERS an approved membership when no tenant was asked for', async () => {
    // Landing a multi-tenant affiliate on a pending application would show them
    // an empty dashboard for no reason.
    const { useCase } = harness([
      membership('aff-pending', 'tenant-1', 'pending'),
      membership('aff-approved', 'tenant-2', 'approved'),
    ]);

    await expect(useCase.execute('user-1')).resolves.toEqual({
      affiliateId: 'aff-approved',
      tenantId: 'tenant-2',
    });
  });

  it('falls back to the FIRST membership when none is approved', async () => {
    // Unlike the approved-only gate, this one exists to let a pending applicant
    // see their own application.
    const { useCase } = harness([
      membership('aff-pending', 'tenant-1', 'pending'),
      membership('aff-suspended', 'tenant-2', 'suspended'),
    ]);

    await expect(useCase.execute('user-1')).resolves.toMatchObject({
      affiliateId: 'aff-pending',
    });
  });

  it('honours an explicitly requested tenant even when it is not approved', async () => {
    const { useCase } = harness([
      membership('aff-approved', 'tenant-1', 'approved'),
      membership('aff-pending', 'tenant-2', 'pending'),
    ]);

    await expect(useCase.execute('user-1', 'tenant-2')).resolves.toMatchObject({
      affiliateId: 'aff-pending',
      tenantId: 'tenant-2',
    });
  });

  it('refuses a requested tenant the user has no membership in', async () => {
    // Falling back to another tenant would silently switch which tenant's data
    // the caller is looking at.
    const { useCase } = harness([membership('aff-approved', 'tenant-1', 'approved')]);

    await expect(useCase.execute('user-1', 'tenant-9')).rejects.toBeInstanceOf(
      AffiliateMembershipRequired,
    );
  });

  it('looks the memberships up for the calling user', async () => {
    const { useCase, asked } = harness([membership('aff-1', 'tenant-1', 'approved')]);

    await useCase.execute('user-1');

    expect(asked).toEqual(['user-1']);
  });
});
