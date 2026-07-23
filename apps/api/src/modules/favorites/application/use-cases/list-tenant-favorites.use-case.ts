import { Inject, Injectable } from '@nestjs/common';
import type { TenantFavoritesQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FAVORITE_READER,
  type FavoriteListPage,
  type IFavoriteReader,
} from '../../domain/ports/favorite-reader.port';

/** Who favorited anything across the tenant (tenant dashboard). */
@Injectable()
export class ListTenantFavoritesUseCase {
  constructor(
    @Inject(FAVORITE_READER) private readonly favorites: IFavoriteReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, query: TenantFavoritesQuery): Promise<FavoriteListPage> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.favorites.listDashboard(tx, query));
  }
}
