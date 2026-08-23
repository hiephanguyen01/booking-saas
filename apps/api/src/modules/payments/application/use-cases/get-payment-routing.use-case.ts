import { Inject, Injectable } from '@nestjs/common';
import {
  customerPaymentMethodSchema,
  type PaymentRoutingResponse,
} from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PAYMENT_METHOD_ROUTE_REPOSITORY,
  type IPaymentMethodRouteRepository,
} from '../../domain/ports/payment-method-route-repository.port';

@Injectable()
export class GetPaymentRoutingUseCase {
  constructor(
    @Inject(PAYMENT_METHOD_ROUTE_REPOSITORY)
    private readonly routes: IPaymentMethodRouteRepository,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(): Promise<PaymentRoutingResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const routes = await this.routes.list(tx, tenantId);
      const order = new Map(customerPaymentMethodSchema.options.map((method, index) => [method, index]));
      return {
        routes: [...routes].sort(
          (a, b) => (order.get(a.method) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.method) ?? Number.MAX_SAFE_INTEGER),
        ),
      };
    });
  }
}
