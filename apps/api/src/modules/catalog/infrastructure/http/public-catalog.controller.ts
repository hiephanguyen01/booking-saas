import { BadRequestException, Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { PublicCatalogSearchResponse, PublicListingTypeResponse } from '@booking/contracts';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ListPublicListingTypesUseCase } from '../../application/use-cases/list-public-listing-types.use-case';
import { SearchPublicCatalogUseCase } from '../../application/use-cases/search-public-catalog.use-case';
import { toPublicListingTypeResponse } from '../../application/catalog.mapper';
import {
  ListPublicListingsQueryDto,
  PublicListingResponseDto,
  PublicListingTypeResponseDto,
} from './dto/catalog.dto';

/** Storefront-facing catalog (§16, §17). Tenant resolved from Host (BFF proxy). */
@ApiTags('public-catalog')
@Controller('public')
export class PublicCatalogController {
  constructor(
    private readonly listTypes: ListPublicListingTypesUseCase,
    private readonly searchCatalog: SearchPublicCatalogUseCase,
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
    @Query() query: ListPublicListingsQueryDto,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicCatalogSearchResponse> {
    const resolvedHost = resolveHost(forwardedHost, host);
    return this.searchCatalog.execute(resolvedHost, query);
  }
}

function resolveHost(forwardedHost?: string, host?: string): string {
  const resolved = forwardedHost?.split(',')[0]?.trim() || host;
  if (!resolved) {
    throw new BadRequestException({
      statusCode: 400,
      code: 'MISSING_HOST',
      message: 'Host header is required to resolve a tenant',
    });
  }
  return resolved;
}
