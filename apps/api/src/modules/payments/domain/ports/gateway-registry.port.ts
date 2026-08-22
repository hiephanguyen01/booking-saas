import type { GatewayPaymentSettings } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { GatewayKey, PaymentGatewayPort } from './payment-gateway.port';

export const GATEWAY_REGISTRY = Symbol('GATEWAY_REGISTRY');

export interface ResolvedGateway {
  gateway: PaymentGatewayPort;
  configRevisionId: string | null;
  settings: GatewayPaymentSettings;
}

export interface PaymentGatewayResolutionInput {
  id: string;
  tenantId: string;
  gateway: GatewayKey;
  gatewayConfigRevisionId: string | null;
}

/** Selects an active checkout adapter or the exact historical adapter for a payment. */
export interface GatewayRegistryPort {
  /** Creds-free adapter for `peekReference` (before the tenant is known). */
  statelessByKey(key: GatewayKey): PaymentGatewayPort;
  resolveActiveForCheckout(
    tx: PrismaTx,
    tenantId: string,
    gateway?: GatewayKey,
  ): Promise<ResolvedGateway>;
  resolveForPayment(
    tx: PrismaTx,
    payment: PaymentGatewayResolutionInput,
  ): Promise<ResolvedGateway>;
  /** Temporary compatibility seam for PR1 callers not yet migrated. */
  resolveForTenant(
    tx: PrismaTx,
    tenantId: string,
    gateway?: GatewayKey,
  ): Promise<PaymentGatewayPort>;
}
