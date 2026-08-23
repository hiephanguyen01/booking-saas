import type { CustomerPaymentMethod, GatewayPaymentSettings } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { GatewayKey, PaymentGatewayPort } from './payment-gateway.port';

export const GATEWAY_REGISTRY = Symbol('GATEWAY_REGISTRY');

export interface ResolvedGateway {
  gateway: PaymentGatewayPort;
  configRevisionId: string | null;
  /** Legacy immutable revision settings used only for historical refund fallback. */
  settings: GatewayPaymentSettings;
}

export interface PaymentGatewayResolutionInput {
  id: string;
  tenantId: string;
  gateway: GatewayKey;
  gatewayConfigRevisionId: string | null;
}

/** Selects an explicit checkout adapter or the exact historical adapter for a payment. */
export interface GatewayRegistryPort {
  /** Creds-free adapter for `peekReference` (before the tenant is known). */
  statelessByKey(key: GatewayKey): PaymentGatewayPort;
  resolveActiveForMethod(
    tx: PrismaTx,
    tenantId: string,
    method: CustomerPaymentMethod,
  ): Promise<ResolvedGateway>;
  /** Temporary compatibility seam removed after every checkout caller migrates. */
  resolveActiveForCheckout(
    tx: PrismaTx,
    tenantId: string,
    gateway?: GatewayKey,
  ): Promise<ResolvedGateway>;
  resolveForPayment(
    tx: PrismaTx,
    payment: PaymentGatewayResolutionInput,
  ): Promise<ResolvedGateway>;
  /** Temporary compatibility seam for legacy callers not yet migrated. */
  resolveForTenant(
    tx: PrismaTx,
    tenantId: string,
    gateway?: GatewayKey,
  ): Promise<PaymentGatewayPort>;
}
