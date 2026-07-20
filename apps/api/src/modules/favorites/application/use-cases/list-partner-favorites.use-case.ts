import { Inject, Injectable } from '@nestjs/common';
import type { PartnerFavoritesQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FAVORITE_REPOSITORY,
  type FavoriteListPage,
  type IFavoriteRepository,
} from '../../domain/ports/favorite-repository.port';

/** Who favorited this partner's listings/groups (partner dashboard). */
@Injectable()
export class ListPartnerFavoritesUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: IFavoriteRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    query: PartnerFavoritesQuery,
  ): Promise<FavoriteListPage> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.favorites.listDashboard(tx, query, partnerId),
    );
  }
}
