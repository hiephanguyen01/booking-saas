import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { PublicTenantResponse } from '@booking/contracts';
import { MissingTenantHost } from '../../../../shared/http/request-boundary-errors';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { UnknownTenantHost } from '../../domain/errors/tenancy-errors';
import { CheckDomainTlsAllowedUseCase } from '../../application/use-cases/check-domain-tls-allowed.use-case';
import { ResolveTenantByHostUseCase } from '../../application/use-cases/resolve-tenant-by-host.use-case';
import { PublicTenantResponseDto } from './dto/tenancy.dto';

/**
 * Storefront tenant resolution (§6.1). The RR7 BFF calls this server-side with
 * the visitor's Host to pick the tenant + theme and decide live vs. suspended.
 */
@ApiTags('public: tenant')
@Controller('public')
export class PublicTenantController {
  constructor(
    private readonly resolve: ResolveTenantByHostUseCase,
    private readonly checkTlsAllowed: CheckDomainTlsAllowedUseCase,
  ) {}

  @Public()
  @Get('tenant')
  @ApiOperation({ summary: 'Resolve the tenant + theme for a storefront Host' })
  @ApiOkResponse({ type: PublicTenantResponseDto })
  async tenant(
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ): Promise<PublicTenantResponse> {
    // The storefront BFF proxies the visitor's Host via x-forwarded-host
    // (fetch cannot set the forbidden `Host` header). Prefer it, fall back to
    // the direct Host. A proxy chain may comma-join hosts — take the first.
    const resolvedHost = forwardedHost?.split(',')[0]?.trim() || host;
    if (!resolvedHost) {
      throw new MissingTenantHost();
    }
    return this.resolve.execute(resolvedHost);
  }

  /**
   * Caddy's on-demand-TLS `ask` endpoint. Caddy blocks the TLS handshake on this
   * call and only obtains a certificate on a 2xx, so it must stay cheap and must
   * fail closed. Reachable ONLY through nginx's loopback-bound `:8081` listener,
   * which exposes this single path — never over the public API hostname, since
   * that request would loop back through the very Caddy instance that is
   * mid-handshake.
   */
  @Public()
  // Every call arrives from one loopback client (Caddy), so a per-IP limit does
  // not shed load from an attacker — it just guarantees that a burst of unknown
  // SNI makes the NEXT genuine tenant domain fail to get a certificate. The real
  // protections are the loopback-only listener, the verified-domain rule, and
  // the Redis host cache, which answers repeats (including misses) without a
  // query.
  @SkipThrottle()
  @Get('domains/tls-allowed')
  @ApiOperation({ summary: 'Whether a hostname may be issued a certificate (Caddy on-demand TLS)' })
  @ApiQuery({ name: 'domain', required: true, example: 'booking.giangstudio.vn' })
  @ApiOkResponse({ schema: { properties: { allowed: { type: 'boolean', example: true } } } })
  @ApiNotFoundResponse({ description: 'UNKNOWN_HOST — not a verified tenant domain' })
  async tlsAllowed(@Query('domain') domain?: string): Promise<{ allowed: true }> {
    const allowed = domain ? await this.checkTlsAllowed.execute(domain) : false;
    // Anything but 2xx is a refusal to Caddy; 404 keeps it identical to how the
    // storefront answers for a host it does not know.
    if (!allowed) throw new UnknownTenantHost(domain ?? '');
    return { allowed: true };
  }
}
