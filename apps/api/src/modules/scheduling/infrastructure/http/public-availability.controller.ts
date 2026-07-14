import {
  type AvailabilityResponse
} from '@booking/contracts';
import { BadRequestException, Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { AvailabilityQueryDto, AvailabilityResponseDto } from './dto/scheduling.dto';

/** Storefront availability for a listing (§9). Tenant resolved from Host (BFF). */
@ApiTags('public-availability')
@Controller('public/listings')
export class PublicAvailabilityController {
  constructor(private readonly getAvailability: GetAvailabilityUseCase) {}

  @Public()
  @Get(':slug/availability')
  @ApiOperation({ summary: 'Get storefront availability for a listing over a date range' })
  @ApiOkResponse({ type: AvailabilityResponseDto })
  async availability(
    @Param('slug') slug: string,
    @Query() query: AvailabilityQueryDto,
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
