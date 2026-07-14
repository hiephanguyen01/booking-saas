import { BadRequestException, Controller, Get, Headers, Param, Query } from '@nestjs/common';
import {
  quoteQuerySchema,
  type PublicListingDetailResponse,
  type QuoteQuery,
  type QuoteResponse,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { GetPublicListingUseCase } from '../../application/use-cases/get-public-listing.use-case';
import { GetPublicQuoteUseCase } from '../../application/use-cases/get-public-quote.use-case';
import { toPublicListingDetailResponse } from '../../application/listing.mapper';

/** Storefront listing detail + quote (§16/§17). Tenant resolved from Host (BFF). */
@Controller('public/listings')
export class PublicListingController {
  constructor(
    private readonly getListing: GetPublicListingUseCase,
    private readonly getQuote: GetPublicQuoteUseCase,
  ) {}

  @Public()
  @Get(':slug')
  async detail(
    @Param('slug') slug: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicListingDetailResponse> {
    return toPublicListingDetailResponse(
      await this.getListing.execute(resolveHost(forwardedHost, host), slug),
    );
  }

  @Public()
  @Get(':slug/quote')
  async quote(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(quoteQuerySchema)) query: QuoteQuery,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<QuoteResponse> {
    return this.getQuote.execute(resolveHost(forwardedHost, host), slug, query);
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
