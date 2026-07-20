import { Inject, Injectable } from '@nestjs/common';
import type { TenantFavoritesQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FAVORITE_REPOSITORY,
  type FavoriteListPage,
  type IFavoriteRepository,
} from '../../domain/ports/favorite-repository.port';

/** Who favorited anything across the tenant (tenant dashboard). */
@Injectable()
export class ListTenantFavoritesUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: IFavoriteRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, query: TenantFavoritesQuery): Promise<FavoriteListPage> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.favorites.listDashboard(tx, query));
  }
}
