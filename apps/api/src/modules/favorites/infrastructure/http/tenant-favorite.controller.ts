import type { FavoriteListResponse, FavoriteSummaryResponse } from '@booking/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import {
  toFavoriteListResponse,
  toFavoriteSummaryResponse,
} from '../../application/favorite.mapper';
import { FavoritesSummaryUseCase } from '../../application/use-cases/favorites-summary.use-case';
import { ListTenantFavoritesUseCase } from '../../application/use-cases/list-tenant-favorites.use-case';
import {
  FavoriteListResponseDto,
  FavoriteSummaryResponseDto,
  TenantFavoritesQueryDto,
} from './dto/favorite.dto';

@ApiTags('tenant-favorites')
@Controller('tenant/favorites')
export class TenantFavoriteController {
  constructor(
    private readonly listFavorites: ListTenantFavoritesUseCase,
    private readonly favoritesSummary: FavoritesSummaryUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.favorites.read')
  @Get()
  @ApiOperation({ summary: 'List who favorited anything across the tenant' })
  @ApiOkResponse({ type: FavoriteListResponseDto })
  async list(@Query() query: TenantFavoritesQueryDto): Promise<FavoriteListResponse> {
    return toFavoriteListResponse(
      await this.listFavorites.execute(this.tenantContext.tenantIdOrThrow(), query),
      query,
    );
  }

  @RequirePermissions('tenant.favorites.read')
  @Get('summary')
  @ApiOperation({ summary: 'Favorite KPI header for the tenant' })
  @ApiOkResponse({ type: FavoriteSummaryResponseDto })
  async summary(): Promise<FavoriteSummaryResponse> {
    return toFavoriteSummaryResponse(
      await this.favoritesSummary.execute(this.tenantContext.tenantIdOrThrow()),
    );
  }
}
