import type {
  GatewayCredentialsFor,
  GatewayKey,
  GatewayPaymentSettings,
  UpsertGatewayConfigInput,
} from '@booking/contracts';
import type { GatewayEnvironment } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const GATEWAY_CONFIG_REPOSITORY = Symbol('GATEWAY_CONFIG_REPOSITORY');

interface GatewayConfigRecordBase<K extends GatewayKey> {
  id: string;
  gateway: K;
  environment: GatewayEnvironment;
  /** Decrypted credentials — the repository decrypts on read. */
  credentials: GatewayCredentialsFor<K>;
  /** Legacy revision settings retained for historical Payment refund fallback only. */
  settings: GatewayPaymentSettings;
}

export type GatewayConfigRecord = {
  [K in GatewayKey]: GatewayConfigRecordBase<K>;
}[GatewayKey];

export type UpsertGatewayConfigData = UpsertGatewayConfigInput;

export interface IGatewayConfigRepository {
  /** Every active provider revision for the tenant. Providers are independent. */
  findActiveAll(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord[]>;
  /** Exact active revision for one provider. */
  findActiveByGateway(
    tx: PrismaTx,
    tenantId: string,
    gateway: GatewayKey,
  ): Promise<GatewayConfigRecord | null>;
  /** Provider-specific config, preferring the active revision for legacy Payment fallback. */
  findByGateway(
    tx: PrismaTx,
    tenantId: string,
    gateway: GatewayKey,
  ): Promise<GatewayConfigRecord | null>;
  /** Exact immutable revision lookup. Tenant scope is mandatory. */
  findById(tx: PrismaTx, tenantId: string, id: string): Promise<GatewayConfigRecord | null>;
  /** Create a successor revision without deactivating any other provider. */
  upsert(
    tx: PrismaTx,
    tenantId: string,
    data: UpsertGatewayConfigData,
  ): Promise<GatewayConfigRecord>;
  /** Disable one provider or every provider when no gateway is supplied. */
  deactivate(tx: PrismaTx, tenantId: string, gateway?: GatewayKey): Promise<void>;
}
