import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PAYMENT_CONFIGURATION_LOCK = Symbol('PAYMENT_CONFIGURATION_LOCK');

/** Serializes every tenant payment-configuration write on one stable lock namespace. */
export interface PaymentConfigurationLockPort {
  acquire(tx: PrismaTx, tenantId: string): Promise<void>;
}
