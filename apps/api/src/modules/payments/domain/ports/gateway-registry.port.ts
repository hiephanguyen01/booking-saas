import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { GatewayKey, PaymentGatewayPort } from './payment-gateway.port';

export const GATEWAY_REGISTRY = Symbol('GATEWAY_REGISTRY');

/**
 * Picks the gateway adapter for a tenant (§11.1). Falls back to the mock when no
 * config is present (dev/test). Implemented by the infrastructure registry.
 */
export interface GatewayRegistryPort {
  /** Creds-free adapter for `peekReference` (before the tenant is known). */
  statelessByKey(key: GatewayKey): PaymentGatewayPort;
  /** The tenant's configured gateway, bound to its decrypted credentials. */
  resolveForTenant(tx: PrismaTx, tenantId: string): Promise<PaymentGatewayPort>;
}
