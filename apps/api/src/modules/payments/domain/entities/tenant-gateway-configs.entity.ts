import {
  GATEWAY_SUPPORTED_METHODS,
  type CustomerPaymentMethod,
  type GatewayKey,
} from '@booking/contracts';
import { UnsupportedPaymentMethod } from '../errors/gateway-config-errors';

/**
 * Tenant-wide gateway configuration policy.
 *
 * The grouped single-active invariant (one active base gateway tenant-wide and
 * one active revision per wallet gateway) stays atomic inside
 * `PrismaGatewayConfigRepository`: an advisory tenant lock serializes the
 * deactivate-then-create successor-revision sequence. Historical credentials
 * and settings are immutable after supersession; only `isActive` may be changed
 * when a revision is replaced or explicitly disabled. This entity states the
 * settings invariant without replacing that repository guard. Credential zod
 * validation remains at the application boundary, and `pickConfigForMethod`
 * remains the routing policy.
 */
export class TenantGatewayConfigs {
  private constructor() {}

  static assertMethodsSupported(
    gateway: GatewayKey,
    enabledMethods: readonly CustomerPaymentMethod[],
  ): void {
    const supported = GATEWAY_SUPPORTED_METHODS[gateway];
    const invalid = enabledMethods.filter((method) => !supported.includes(method));
    if (invalid.length > 0) {
      throw new UnsupportedPaymentMethod(gateway, invalid);
    }
  }
}
