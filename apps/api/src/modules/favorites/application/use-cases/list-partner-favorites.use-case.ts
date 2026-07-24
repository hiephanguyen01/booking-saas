import { Inject, Injectable } from '@nestjs/common';
import type { PartnerFavoritesQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FAVORITE_READER,
  type FavoriteListPage,
  type IFavoriteReader,
} from '../../domain/ports/favorite-reader.port';

/** Who favorited this partner's listings/groups (partner dashboard). */
@Injectable()
export class ListPartnerFavoritesUseCase {
  constructor(
    @Inject(FAVORITE_READER) private readonly favorites: IFavoriteReader,
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
