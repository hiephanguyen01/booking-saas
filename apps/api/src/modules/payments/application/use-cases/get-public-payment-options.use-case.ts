import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DEFAULT_GATEWAY_PAYMENT_SETTINGS, type PublicPaymentOptions } from '@booking/contracts';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';

/** Public provider-neutral method list for the tenant resolved from Host. */
@Injectable()
export class GetPublicPaymentOptionsUseCase {
  constructor(
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string): Promise<PublicPaymentOptions> {
    const tenant = await this.resolveTenant.execute(host);
    const config = await this.tenantDb.forTenant(tenant.id, (tx) =>
      this.configs.findActive(tx, tenant.id),
    );
    if (!config) {
      if (process.env.ALLOW_MOCK_PAYMENTS === 'true' && process.env.NODE_ENV !== 'production') {
        return { methods: DEFAULT_GATEWAY_PAYMENT_SETTINGS.enabledMethods };
      }
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'PAYMENT_NOT_CONFIGURED',
        message: 'This storefront is not accepting online payments',
      });
    }
    return { methods: config.settings.enabledMethods };
  }
}
