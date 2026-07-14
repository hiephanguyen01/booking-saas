import { BadRequestException, Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  publicListingsFilterSchema,
  type PublicListingResponse,
  type PublicListingTypeResponse,
} from '@booking/contracts';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ListPublicListingTypesUseCase } from '../../application/use-cases/list-public-listing-types.use-case';
import { ListPublicListingsUseCase } from '../../application/use-cases/list-public-listings.use-case';
import { toPublicListingResponse, toPublicListingTypeResponse } from '../../application/catalog.mapper';
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
    private readonly listListings: ListPublicListingsUseCase,
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
  @ApiOperation({ summary: 'Storefront listing search (supports dynamic attr.* equality filters)' })
  @ApiQuery({ type: ListPublicListingsQueryDto })
  @ApiOkResponse({ type: [PublicListingResponseDto] })
  async listings(
    @Query() query: Record<string, string>,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicListingResponse[]> {
    const resolvedHost = resolveHost(forwardedHost, host);
    const filters = publicListingsFilterSchema.parse(query);
    const listings = await this.listListings.execute(resolvedHost, filters);
    const items = listings.map(toPublicListingResponse);
    const deduped = new Map<string, PublicListingResponse>();
    for (const item of items) {
      const existing = deduped.get(item.id);
      if (!existing) {
        deduped.set(item.id, item);
        continue;
      }
      const prices = [existing.priceFrom, item.priceFrom].filter((price): price is string => price !== null).map(Number);
      if (prices.length) existing.priceFrom = String(Math.min(...prices));
    }
    return [...deduped.values()];
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
