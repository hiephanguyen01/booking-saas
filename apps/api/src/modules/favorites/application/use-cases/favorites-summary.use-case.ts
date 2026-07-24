import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FAVORITE_READER,
  type FavoriteSummaryRecord,
  type IFavoriteReader,
} from '../../domain/ports/favorite-reader.port';

/** KPI header for the dashboard favorites page — total hearts + top targets. */
@Injectable()
export class FavoritesSummaryUseCase {
  constructor(
    @Inject(FAVORITE_READER) private readonly favorites: IFavoriteReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId?: string): Promise<FavoriteSummaryRecord> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.favorites.summary(tx, partnerId));
  }
}
