import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { FavoriteTarget, FavoriteToggleResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FAVORITE_REPOSITORY,
  type IFavoriteRepository,
} from '../../domain/ports/favorite-repository.port';
import {
  FAVORITE_TENANT_READER,
  type IFavoriteTenantReader,
} from '../../domain/ports/favorite-tenant-reader.port';

@Injectable()
export class AddFavoriteUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: IFavoriteRepository,
    @Inject(FAVORITE_TENANT_READER) private readonly tenants: IFavoriteTenantReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    customerId: string,
    target: FavoriteTarget,
  ): Promise<FavoriteToggleResponse> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const partnerId = await this.favorites.resolveTargetPartnerId(tx, target);
      if (!partnerId)
        throw new NotFoundException({
          statusCode: 404,
          code: 'FAVORITE_TARGET_NOT_FOUND',
          message: 'Listing or group not found',
        });
      await this.favorites.add(tx, tenantId, customerId, partnerId, target);
      return { ...target, favorited: true };
    });
  }
}
