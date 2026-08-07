import { Inject, Injectable } from '@nestjs/common';
import type { TenancyConfigResponse } from '@booking/contracts';
import { TENANCY_CONFIG, type TenancyConfig } from '../../domain/ports/tenancy-config.port';

/**
 * Exposes the platform tenancy config: the base domain tenant subdomains are
 * provisioned under (admin create-tenant form) plus the two DNS targets a custom
 * domain must point at (tenant domain settings). Read by both audiences — the
 * tenant needs the targets to make its own domain work, and a hardcoded target
 * in the frontend would silently break the moment the Elastic IP changed.
 */
@Injectable()
export class GetTenancyConfigUseCase {
  constructor(@Inject(TENANCY_CONFIG) private readonly config: TenancyConfig) {}

  execute(): TenancyConfigResponse {
    return {
      baseDomain: this.config.baseDomain,
      storefrontCname: this.config.storefrontCname,
      storefrontIpv4: this.config.storefrontIpv4,
    };
  }
}
