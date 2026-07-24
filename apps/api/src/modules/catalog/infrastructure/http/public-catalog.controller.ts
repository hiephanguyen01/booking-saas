import { BadRequestException, Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  publicCatalogSearchQuerySchema,
  type PublicCatalogSearchResponse,
  type PublicListingResponse,
  type PublicListingTypeResponse,
} from '@booking/contracts';
import { z } from 'zod';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { MAX_FEATURED_LISTINGS } from '../../application/featured-listings';
import { ListPublicListingTypesUseCase } from '../../application/use-cases/list-public-listing-types.use-case';
import { ListPublicListingsUseCase } from '../../application/use-cases/list-public-listings.use-case';
import { SearchPublicCatalogUseCase } from '../../application/use-cases/search-public-catalog.use-case';
import {
  toPublicListingResponse,
  toPublicListingTypeResponse,
} from '../../application/catalog.mapper';
import {
  ListPublicListingsQueryDto,
  PublicListingResponseDto,
  PublicListingTypeResponseDto,
} from './dto/catalog.dto';

const featuredListingsQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(MAX_FEATURED_LISTINGS).default(18),
});

/** Storefront-facing catalog (§16, §17). Tenant resolved from Host (BFF proxy). */
@ApiTags('public-catalog')
@Controller('public')
export class PublicCatalogController {
  constructor(
    private readonly listTypes: ListPublicListingTypesUseCase,
    private readonly listListings: ListPublicListingsUseCase,
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
  @Get('featured-listings')
  @ApiOperation({ summary: 'Bounded newest listings for the Storefront home page' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 18 })
  @ApiOkResponse({ type: [PublicListingResponseDto] })
  async featuredListings(
    @Query() query: Record<string, unknown>,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicListingResponse[]> {
    const parsed = featuredListingsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_FEATURED_LISTINGS_QUERY',
        message: 'Invalid featured listings query',
        issues: parsed.error.issues,
      });
    }
    const listings = await this.listListings.featured(
      resolveHost(forwardedHost, host),
      parsed.data.pageSize,
    );
    return listings.map(toPublicListingResponse);
  }

  @Public()
  @Get('listings')
  @ApiOperation({
    summary: 'Storefront listing search with listing-type facets, availability and pagination',
  })
  @ApiQuery({ type: ListPublicListingsQueryDto })
  @ApiOkResponse({ type: PublicListingResponseDto })
  async listings(
    @Query() query: Record<string, unknown>,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicCatalogSearchResponse> {
    const resolvedHost = resolveHost(forwardedHost, host);
    const parsed = publicCatalogSearchQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_CATALOG_SEARCH',
        message: 'Invalid catalog search query',
        issues: parsed.error.issues,
      });
    }
    return this.searchCatalog.execute(resolvedHost, parsed.data);
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
