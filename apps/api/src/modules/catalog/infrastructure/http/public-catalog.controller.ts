import { Body, Controller, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type {
  PublicCatalogSearchQuery,
  PublicCatalogSearchResponse,
  PublicListingTypeResponse,
  NearbyPublicListingsInput,
  NearbyPublicListingsResponse,
} from '@booking/contracts';
import { MissingTenantHost } from '../../../../shared/http/request-boundary-errors';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ListPublicListingTypesUseCase } from '../../application/use-cases/list-public-listing-types.use-case';
import { SearchPublicCatalogUseCase } from '../../application/use-cases/search-public-catalog.use-case';
import { ListNearbyPublicListingsUseCase } from '../../application/use-cases/list-nearby-public-listings.use-case';
import { toPublicListingTypeResponse } from '../../application/catalog.mapper';
import {
  ListPublicListingsQueryDto,
  PublicListingResponseDto,
  PublicListingTypeResponseDto,
  NearbyPublicListingsInputDto,
  NearbyPublicListingsResponseDto,
} from './dto/catalog.dto';
import { CatalogSearchValidationPipe } from './catalog-search-validation.pipe';

/** Storefront-facing catalog (§16, §17). Tenant resolved from Host (BFF proxy). */
@ApiTags('public-catalog')
@Controller('public')
export class PublicCatalogController {
  constructor(
    private readonly listTypes: ListPublicListingTypesUseCase,
    private readonly searchCatalog: SearchPublicCatalogUseCase,
    private readonly listNearby: ListNearbyPublicListingsUseCase,
  ) {}

  @Public()
  @Get('listing-types')
  @ApiOperation({ summary: 'Storefront menu of active listing types for the resolved tenant' })
  @ApiOkResponse({ type: [PublicListingTypeResponseDto] })
  async listingTypes(
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicListingTypeResponse[]> {
    const types = await this.listTypes.execute(resolveHost(forwardedHost, host));
    return types.map(toPublicListingTypeResponse);
  }

  @Public()
  @Get('listings')
  @ApiOperation({
    summary: 'Storefront listing search with listing-type facets, availability and pagination',
  })
  @ApiQuery({ type: ListPublicListingsQueryDto })
  @ApiOkResponse({ type: PublicListingResponseDto })
  async listings(
    @Query(new CatalogSearchValidationPipe()) query: PublicCatalogSearchQuery,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicCatalogSearchResponse> {
    const resolvedHost = resolveHost(forwardedHost, host);
    return this.searchCatalog.execute(resolvedHost, query);
  }

  @Public()
  @Post('listings/nearby')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ten nearest public listing cards to a device coordinate' })
  @ApiOkResponse({ type: NearbyPublicListingsResponseDto })
  async nearbyListings(
    @Body() input: NearbyPublicListingsInputDto,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<NearbyPublicListingsResponse> {
    return this.listNearby.execute(
      resolveHost(forwardedHost, host),
      input as NearbyPublicListingsInput,
    );
  }
}

function resolveHost(forwardedHost?: string, host?: string): string {
  const resolved = forwardedHost?.split(',')[0]?.trim() || host;
  if (!resolved) {
    throw new MissingTenantHost();
  }
  return resolved;
}
