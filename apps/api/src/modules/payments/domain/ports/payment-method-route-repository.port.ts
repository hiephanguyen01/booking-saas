import type { CustomerPaymentMethod, GatewayKey, PaymentMethodRoute } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PAYMENT_METHOD_ROUTE_REPOSITORY = Symbol('PAYMENT_METHOD_ROUTE_REPOSITORY');

export interface IPaymentMethodRouteRepository {
  list(tx: PrismaTx, tenantId: string): Promise<PaymentMethodRoute[]>;
  findEnabledByMethod(
    tx: PrismaTx,
    tenantId: string,
    method: CustomerPaymentMethod,
  ): Promise<PaymentMethodRoute | null>;
  replaceAll(
    tx: PrismaTx,
    tenantId: string,
    routes: PaymentMethodRoute[],
  ): Promise<PaymentMethodRoute[]>;
  hasConfiguredRoutes(tx: PrismaTx, tenantId: string): Promise<boolean>;
  listEffective(
    tx: PrismaTx,
    tenantId: string,
    activeGateways: ReadonlySet<GatewayKey>,
  ): Promise<PaymentMethodRoute[]>;
}
