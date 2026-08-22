import { describe, expect, it } from 'vitest';
import type { ScopeMembership } from '@booking/contracts';
import { fakePort } from '~testing';
import type { ISessionInfoReader } from '../../domain/ports/session-info-reader.port';
import { GetSessionInfoUseCase } from './get-session-info.use-case';

const MEMBERSHIPS = [
  { scope: 'tenant', tenantId: 'tenant-1', permissions: ['tenant.listing.approve'] },
] as unknown as ScopeMembership[];

describe('GetSessionInfoUseCase', () => {
  it('reads the memberships of the user it was asked about', async () => {
    // The dashboard shell gates nav on this, so answering for the wrong user
    // would show someone another tenant's areas.
    const asked: string[] = [];
    const useCase = new GetSessionInfoUseCase(
      fakePort<ISessionInfoReader>({
        listMemberships: (userId) => {
          asked.push(userId);
          return Promise.resolve(MEMBERSHIPS);
        },
      }),
    );

    const result = await useCase.execute('user-1');

    expect(asked).toEqual(['user-1']);
    expect(result).toBe(MEMBERSHIPS);
  });
});
