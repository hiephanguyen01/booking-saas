import {
  type PublicListingDetailWithTimezoneResponse,
  type PublicListingGroupDetailResponse,
  type QuoteResponse,
} from '@booking/contracts';
import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { MissingTenantHost } from '../../../../shared/http/request-boundary-errors';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { toPublicListingDetailResponse } from '../../application/listing.mapper';
import { GetPublicListingUseCase } from '../../application/use-cases/get-public-listing.use-case';
import { GetPublicQuoteUseCase } from '../../application/use-cases/get-public-quote.use-case';
import { GetPublicListingGroupUseCase } from '../../application/use-cases/get-public-listing-group.use-case';
import {
  PublicListingDetailResponseDto,
  PublicListingGroupDetailResponseDto,
  QuoteQueryDto,
  QuoteResponseDto,
} from './dto/listing.dto';

/** Storefront listing detail + quote (§16/§17). Tenant resolved from Host (BFF). */
@ApiTags('public-listings')
@Controller('public/listings')
export class PublicListingController {
  constructor(
    private readonly getListing: GetPublicListingUseCase,
    private readonly getQuote: GetPublicQuoteUseCase,
    private readonly getGroup: GetPublicListingGroupUseCase,
  ) {}

  @Public()
  @Get('/groups/:slug')
  @ApiOperation({ summary: 'Public storefront listing-group detail' })
  @ApiParam({ name: 'slug', type: 'string' })
  @ApiOkResponse({ type: PublicListingGroupDetailResponseDto })
  async groupDetail(
    @Param('slug') slug: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicListingGroupDetailResponse> {
    return this.getGroup.execute(resolveHost(forwardedHost, host), slug);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Public storefront listing detail' })
  @ApiParam({ name: 'slug', type: 'string' })
  @ApiOkResponse({ type: PublicListingDetailResponseDto })
  async detail(
    @Param('slug') slug: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicListingDetailWithTimezoneResponse> {
    return toPublicListingDetailResponse(
      await this.getListing.execute(resolveHost(forwardedHost, host), slug),
    );
  }

  @Public()
  @Get(':slug/quote')
  @ApiOperation({ summary: 'Public price quote for a listing' })
  @ApiParam({ name: 'slug', type: 'string' })
  @ApiOkResponse({ type: QuoteResponseDto })
  async quote(
    @Param('slug') slug: string,
    @Query() query: QuoteQueryDto,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<QuoteResponse> {
    return this.getQuote.execute(resolveHost(forwardedHost, host), slug, query);
  }
}

function resolveHost(forwardedHost?: string, host?: string): string {
  const resolved = forwardedHost?.split(',')[0]?.trim() || host;
  if (!resolved) {
    throw new MissingTenantHost();
  }
  return resolved;
}
