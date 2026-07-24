import { Inject, Injectable } from '@nestjs/common';
import type { FavoriteTarget, FavoriteToggleResponse } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { Favorite } from '../../domain/entities/favorite.entity';
import { FavoriteTargetNotFound } from '../../domain/errors/favorite-errors';
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
    if (!tenantId) throw new TenantNotFound();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const favoritable = await this.favorites.findFavoritableTarget(tx, target);
      if (!favoritable) throw new FavoriteTargetNotFound();
      await this.favorites.add(tx, Favorite.open({ tenantId, customerId, target: favoritable }));
      return { ...target, favorited: true };
    });
  }
}
