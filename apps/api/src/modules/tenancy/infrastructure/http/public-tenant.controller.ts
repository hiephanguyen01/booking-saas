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
  async tenant(@Headers('host') host?: string): Promise<PublicTenantResponse> {
    if (!host) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'MISSING_HOST',
        message: 'Host header is required to resolve a tenant',
      });
    }
    return this.resolve.execute(host);
  }
}
