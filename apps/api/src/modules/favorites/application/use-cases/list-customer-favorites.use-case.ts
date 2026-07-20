import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CustomerFavoritesQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FAVORITE_REPOSITORY,
  type CustomerFavoritePage,
  type IFavoriteRepository,
} from '../../domain/ports/favorite-repository.port';
import {
  FAVORITE_TENANT_READER,
  type IFavoriteTenantReader,
} from '../../domain/ports/favorite-tenant-reader.port';

/** The account "my favorites" grid — favorited listings/groups as storefront cards. */
@Injectable()
export class ListCustomerFavoritesUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: IFavoriteRepository,
    @Inject(FAVORITE_TENANT_READER) private readonly tenants: IFavoriteTenantReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    customerId: string,
    query: CustomerFavoritesQuery,
  ): Promise<CustomerFavoritePage> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.favorites.listCustomer(tx, customerId, query),
    );
  }
}
