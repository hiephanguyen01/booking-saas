import { Inject, Injectable } from '@nestjs/common';
import {
  paymentRoutingInputSchema,
  type PaymentRoutingInput,
  type PaymentRoutingResponse,
} from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import {
  PAYMENT_CONFIGURATION_LOCK,
  type PaymentConfigurationLockPort,
} from '../../domain/ports/payment-configuration-lock.port';
import {
  PAYMENT_METHOD_ROUTE_REPOSITORY,
  type IPaymentMethodRouteRepository,
} from '../../domain/ports/payment-method-route-repository.port';
import { InvalidPaymentRouting, PaymentRoutingProviderInactive } from '../payment-http-errors';

@Injectable()
export class UpdatePaymentRoutingUseCase {
  constructor(
    @Inject(PAYMENT_METHOD_ROUTE_REPOSITORY)
    private readonly routes: IPaymentMethodRouteRepository,
    @Inject(GATEWAY_CONFIG_REPOSITORY)
    private readonly configs: IGatewayConfigRepository,
    @Inject(PAYMENT_CONFIGURATION_LOCK)
    private readonly configurationLock: PaymentConfigurationLockPort,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(input: PaymentRoutingInput): Promise<PaymentRoutingResponse> {
    const parsed = paymentRoutingInputSchema.safeParse(input);
    if (!parsed.success) throw new InvalidPaymentRouting(parsed.error.flatten());
    if (
      parsed.data.routes.some((route) => route.gateway === 'mock') &&
      (process.env.NODE_ENV === 'production' || process.env.ALLOW_MOCK_PAYMENTS !== 'true')
    ) {
      throw new InvalidPaymentRouting({ gateway: ['Mock payments are not allowed'] });
    }

    const tenantId = this.tenantContext.tenantIdOrThrow();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.configurationLock.acquire(tx, tenantId);
      const active = await this.configs.findActiveAll(tx, tenantId);
      const activeGateways = new Set(active.map((config) => config.gateway));
      for (const route of parsed.data.routes) {
        if (route.enabled && !activeGateways.has(route.gateway)) {
          throw new PaymentRoutingProviderInactive(route.gateway);
        }
      }
      return { routes: await this.routes.replaceAll(tx, tenantId, parsed.data.routes) };
    });
  }
}
