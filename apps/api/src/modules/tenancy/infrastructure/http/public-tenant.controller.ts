import { BadRequestException, Controller, Get, Headers } from '@nestjs/common';
import type { PublicTenantResponse } from '@booking/shared';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { ResolveTenantByHostUseCase } from '../../application/use-cases/resolve-tenant-by-host.use-case';

/**
 * Storefront tenant resolution (§6.1). The RR7 BFF calls this server-side with
 * the visitor's Host to pick the tenant + theme and decide live vs. suspended.
 */
@Controller('public')
export class PublicTenantController {
  constructor(private readonly resolve: ResolveTenantByHostUseCase) {}

  @Public()
  @Get('tenant')
  async tenant(
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicTenantResponse> {
    // The storefront BFF proxies the visitor's Host via x-forwarded-host
    // (fetch cannot set the forbidden `Host` header). Prefer it, fall back to
    // the direct Host. A proxy chain may comma-join hosts — take the first.
    const resolvedHost = forwardedHost?.split(',')[0]?.trim() || host;
    if (!resolvedHost) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'MISSING_HOST',
        message: 'Host header is required to resolve a tenant',
      });
    }
    return this.resolve.execute(resolvedHost);
  }
}
