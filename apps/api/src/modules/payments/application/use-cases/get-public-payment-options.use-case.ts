import { Inject, Injectable } from '@nestjs/common';
import {
  customerPaymentMethodSchema,
  DEFAULT_GATEWAY_PAYMENT_SETTINGS,
  GATEWAY_SUPPORTED_METHODS,
  type PublicPaymentOptions,
} from '@booking/contracts';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import {
  PAYMENT_METHOD_ROUTE_REPOSITORY,
  type IPaymentMethodRouteRepository,
} from '../../domain/ports/payment-method-route-repository.port';
import { PaymentNotConfigured } from '../payment-http-errors';

function mockAllowed(): boolean {
  return process.env.ALLOW_MOCK_PAYMENTS === 'true' && process.env.NODE_ENV !== 'production';
}

/** Public provider-neutral method list derived only from explicit effective routes. */
@Injectable()
export class GetPublicPaymentOptionsUseCase {
  constructor(
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
    @Inject(PAYMENT_METHOD_ROUTE_REPOSITORY)
    private readonly routes: IPaymentMethodRouteRepository,
  ) {}

  async execute(host: string): Promise<PublicPaymentOptions> {
    const tenant = await this.resolveTenant.execute(host);

    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const [configs, routes] = await Promise.all([
        this.configs.findActiveAll(tx, tenant.id),
        this.routes.list(tx, tenant.id),
      ]);
      const activeGateways = new Set(configs.map((config) => config.gateway));
      const allowMock = mockAllowed();

      const methods = customerPaymentMethodSchema.options.filter((method) => {
        const route = routes.find((candidate) => candidate.method === method);
        if (!route?.enabled) return false;
        if (!GATEWAY_SUPPORTED_METHODS[route.gateway].includes(method)) return false;
        if (route.gateway === 'mock' && !allowMock) return false;
        return activeGateways.has(route.gateway);
      });
      if (methods.length > 0) return { methods };

      // Preserve the existing local-dev convenience only for a truly unconfigured
      // tenant. Any stored route row — including all-disabled rows — or active
      // provider connection is explicit tenant state and must never resurrect mock checkout.
      if (routes.length === 0 && configs.length === 0 && allowMock) {
        return { methods: DEFAULT_GATEWAY_PAYMENT_SETTINGS.enabledMethods };
      }

      throw new PaymentNotConfigured();
    });
  }
}
