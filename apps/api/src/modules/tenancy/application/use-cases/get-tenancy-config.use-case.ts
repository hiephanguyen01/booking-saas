import { Inject, Injectable } from '@nestjs/common';
import type { TenancyConfigResponse } from '@booking/contracts';
import { TENANCY_CONFIG, type TenancyConfig } from '../../domain/ports/tenancy-config';

/**
 * Exposes the platform tenancy config — the base domain tenant subdomains are
 * provisioned under — for the admin create-tenant form.
 */
@Injectable()
export class GetTenancyConfigUseCase {
  constructor(@Inject(TENANCY_CONFIG) private readonly config: TenancyConfig) {}

  execute(): TenancyConfigResponse {
    return { baseDomain: this.config.baseDomain };
  }
}
