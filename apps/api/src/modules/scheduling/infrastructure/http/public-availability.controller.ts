import { BadRequestException, Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { availabilityQuerySchema, type AvailabilityQuery, type AvailabilityResponse } from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';

/** Storefront availability for a listing (§9). Tenant resolved from Host (BFF). */
@Controller('public/listings')
export class PublicAvailabilityController {
  constructor(private readonly getAvailability: GetAvailabilityUseCase) {}

  @Public()
  @Get(':slug/availability')
  async availability(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQuery,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<AvailabilityResponse> {
    return this.getAvailability.execute(resolveHost(forwardedHost, host), slug, query);
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
