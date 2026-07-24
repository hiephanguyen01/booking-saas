import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { FAVORITE_READER } from '../../domain/ports/favorite-reader.port';
import { FAVORITE_REPOSITORY } from '../../domain/ports/favorite-repository.port';
import { FAVORITE_TENANT_READER } from '../../domain/ports/favorite-tenant-reader.port';
import { AddFavoriteUseCase } from '../../application/use-cases/add-favorite.use-case';
import { FavoritesSummaryUseCase } from '../../application/use-cases/favorites-summary.use-case';
import { ListCustomerFavoritesUseCase } from '../../application/use-cases/list-customer-favorites.use-case';
import { ListFavoriteRefsUseCase } from '../../application/use-cases/list-favorite-refs.use-case';
import { ListPartnerFavoritesUseCase } from '../../application/use-cases/list-partner-favorites.use-case';
import { ListTenantFavoritesUseCase } from '../../application/use-cases/list-tenant-favorites.use-case';
import { RemoveFavoriteUseCase } from '../../application/use-cases/remove-favorite.use-case';
import { PrismaFavoriteRepository } from '../repositories/prisma-favorite.repository';
import { PrismaFavoriteTenantReader } from '../repositories/prisma-favorite-tenant.reader';
import { CustomerFavoriteController } from './customer-favorite.controller';
import { PartnerFavoriteController } from './partner-favorite.controller';
import { TenantFavoriteController } from './tenant-favorite.controller';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [CustomerFavoriteController, PartnerFavoriteController, TenantFavoriteController],
  providers: [
    PrismaFavoriteRepository,
    { provide: FAVORITE_REPOSITORY, useExisting: PrismaFavoriteRepository },
    { provide: FAVORITE_READER, useExisting: PrismaFavoriteRepository },
    { provide: FAVORITE_TENANT_READER, useClass: PrismaFavoriteTenantReader },
    AddFavoriteUseCase,
    RemoveFavoriteUseCase,
    ListCustomerFavoritesUseCase,
    ListFavoriteRefsUseCase,
    ListPartnerFavoritesUseCase,
    ListTenantFavoritesUseCase,
    FavoritesSummaryUseCase,
  ],
})
export class FavoritesModule {}
