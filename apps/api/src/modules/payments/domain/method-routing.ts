import {
  GATEWAY_SUPPORTED_METHODS,
  isWalletGateway,
  walletGatewayForMethod,
  type CustomerPaymentMethod,
} from '@booking/contracts';
import type { GatewayConfigRecord } from './ports/gateway-config-repository.port';

/**
 * Chọn config phục vụ 1 method: method ví → đúng cổng ví đó (1:1); method base →
 * cổng BASE đang active có bật method. Trả null khi không cổng nào phục vụ.
 */
export function pickConfigForMethod(
  configs: GatewayConfigRecord[],
  method: CustomerPaymentMethod,
): GatewayConfigRecord | null {
  const wallet = walletGatewayForMethod(method);
  const serves = (c: GatewayConfigRecord): boolean =>
    c.settings.enabledMethods.includes(method) &&
    GATEWAY_SUPPORTED_METHODS[c.gateway].includes(method);
  if (wallet) return configs.find((c) => c.gateway === wallet && serves(c)) ?? null;
  return configs.find((c) => !isWalletGateway(c.gateway) && serves(c)) ?? null;
}
