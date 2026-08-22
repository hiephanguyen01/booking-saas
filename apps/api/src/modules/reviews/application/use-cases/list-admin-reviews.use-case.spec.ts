import { describe, expect, it } from 'vitest';
import type { AdminReviewsQuery } from '@booking/contracts';
import { fakePort } from '~testing';
import type {
  AdminReviewPage,
  IAdminReviewReader,
} from '../../domain/ports/admin-review-reader.port';
import { ListAdminReviewsUseCase } from './list-admin-reviews.use-case';

const PAGE = { items: [], total: 0 } as unknown as AdminReviewPage;

describe('ListAdminReviewsUseCase', () => {
  it('reads CROSS-TENANT, so it opens no tenant transaction at all', async () => {
    // The platform board spans every tenant; a tenant scope would filter it down
    // to one, and the reader owns the admin-pool query instead.
    const seen: unknown[] = [];
    const useCase = new ListAdminReviewsUseCase(
      fakePort<IAdminReviewReader>({
        list: (query) => {
          seen.push(query);
          return Promise.resolve(PAGE);
        },
      }),
    );

    const query = { page: 2, pageSize: 50 } as AdminReviewsQuery;
    const result = await useCase.execute(query);

    expect(seen).toEqual([query]);
    expect(result).toBe(PAGE);
  });
});
