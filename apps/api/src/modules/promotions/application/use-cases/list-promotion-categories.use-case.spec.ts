import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IPromoContextLookup,
  PromoCategory,
} from '../../domain/ports/promo-context-lookup.port';
import { ListPromotionCategoriesUseCase } from './list-promotion-categories.use-case';

const CATEGORIES: PromoCategory[] = [{ id: 'cat-1', name: 'Sân bóng', slug: 'san-bong' }];

describe('ListPromotionCategoriesUseCase', () => {
  it('reads the tenant’s own categories for the scope picker', async () => {
    // Inside the tenant transaction, so RLS is what keeps another tenant's
    // category names out of the picker.
    const tenantDb = fakeTenantDb();
    const useCase = new ListPromotionCategoriesUseCase(
      fakePort<IPromoContextLookup>({ listCategories: () => Promise.resolve(CATEGORIES) }),
      tenantDb.service,
    );

    await expect(useCase.execute('tenant-1')).resolves.toBe(CATEGORIES);
    expect(tenantDb.openedFor).toEqual(['tenant-1']);
  });
});
