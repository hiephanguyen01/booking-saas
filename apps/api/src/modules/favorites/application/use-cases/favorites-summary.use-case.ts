import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FAVORITE_REPOSITORY,
  type FavoriteSummaryRecord,
  type IFavoriteRepository,
} from '../../domain/ports/favorite-repository.port';

/** KPI header for the dashboard favorites page — total hearts + top targets. */
@Injectable()
export class FavoritesSummaryUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: IFavoriteRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId?: string): Promise<FavoriteSummaryRecord> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.favorites.summary(tx, partnerId));
  }
}
