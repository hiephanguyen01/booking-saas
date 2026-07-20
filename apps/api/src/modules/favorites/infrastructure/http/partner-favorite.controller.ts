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
import { ListPartnerFavoritesUseCase } from '../../application/use-cases/list-partner-favorites.use-case';
import {
  FavoriteListResponseDto,
  FavoriteSummaryResponseDto,
  PartnerFavoritesQueryDto,
} from './dto/favorite.dto';

@ApiTags('partner-favorites')
@Controller('partner/favorites')
export class PartnerFavoriteController {
  constructor(
    private readonly listFavorites: ListPartnerFavoritesUseCase,
    private readonly favoritesSummary: FavoritesSummaryUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.favorites.read')
  @Get()
  @ApiOperation({ summary: 'List who favorited the partner listings/groups' })
  @ApiOkResponse({ type: FavoriteListResponseDto })
  async list(@Query() query: PartnerFavoritesQueryDto): Promise<FavoriteListResponse> {
    return toFavoriteListResponse(
      await this.listFavorites.execute(
        this.tenantContext.tenantIdOrThrow(),
        this.tenantContext.partnerIdOrThrow(),
        query,
      ),
      query,
    );
  }

  @RequirePermissions('partner.favorites.read')
  @Get('summary')
  @ApiOperation({ summary: 'Favorite KPI header for the partner' })
  @ApiOkResponse({ type: FavoriteSummaryResponseDto })
  async summary(): Promise<FavoriteSummaryResponse> {
    return toFavoriteSummaryResponse(
      await this.favoritesSummary.execute(
        this.tenantContext.tenantIdOrThrow(),
        this.tenantContext.partnerIdOrThrow(),
      ),
    );
  }
}
