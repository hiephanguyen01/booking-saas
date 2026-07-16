import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMO_CONTEXT_LOOKUP,
  type IPromoContextLookup,
  type PromoCategory,
} from '../../domain/ports/promo-context-lookup.port';

/**
 * The tenant's categories, so the `category` promotion scope is actually selectable
 * (§12.2) — it is a first-class scope in the contract and in `scopeMatches()`, but
 * until now no endpoint exposed the categories behind it, leaving the picker to a
 * raw uuid box.
 */
@Injectable()
export class ListPromotionCategoriesUseCase {
  constructor(
    @Inject(PROMO_CONTEXT_LOOKUP) private readonly lookup: IPromoContextLookup,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string): Promise<PromoCategory[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.lookup.listCategories(tx));
  }
}
