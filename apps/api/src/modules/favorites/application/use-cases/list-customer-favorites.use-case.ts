import { Inject, Injectable } from '@nestjs/common';
import type { CustomerFavoriteListResponse, CustomerFavoritesQuery } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import { FAVORITE_READER, type IFavoriteReader } from '../../domain/ports/favorite-reader.port';
import { toCustomerFavoriteListResponse } from '../favorite.mapper';
import {
  FAVORITE_TENANT_READER,
  type IFavoriteTenantReader,
} from '../../domain/ports/favorite-tenant-reader.port';

/** The account "my favorites" grid — favorited listings/groups as storefront cards. */
@Injectable()
export class ListCustomerFavoritesUseCase {
  constructor(
    @Inject(FAVORITE_READER) private readonly favorites: IFavoriteReader,
    @Inject(FAVORITE_TENANT_READER) private readonly tenants: IFavoriteTenantReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    customerId: string,
    query: CustomerFavoritesQuery,
  ): Promise<CustomerFavoriteListResponse> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) throw new TenantNotFound();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const now = utcNow();
      const page = await this.favorites.listCustomer(tx, customerId, query);
      return toCustomerFavoriteListResponse(page, query, now);
    });
  }
}
