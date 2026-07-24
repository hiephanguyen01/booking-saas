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
  settings: GatewayPaymentSettings;
}

export type GatewayConfigRecord = {
  [K in GatewayKey]: GatewayConfigRecordBase<K>;
}[GatewayKey];

export type UpsertGatewayConfigData = UpsertGatewayConfigInput;

export interface IGatewayConfigRepository {
  /** Every active gateway config (decrypted) for the tenant — base + wallets. */
  findActiveAll(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord[]>;
  /** Cổng BASE (sepay/payos/mock) đang active — tối đa 1; ví KHÔNG tính. */
  findActiveBase(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord | null>;
  /** Provider-specific config, including inactive records needed by old webhooks. */
  findByGateway(
    tx: PrismaTx,
    tenantId: string,
    gateway: GatewayKey,
  ): Promise<GatewayConfigRecord | null>;
  upsert(
    tx: PrismaTx,
    tenantId: string,
    data: UpsertGatewayConfigData,
  ): Promise<GatewayConfigRecord>;
  /** Tắt 1 cổng (gateway) hoặc tắt hết (không truyền). */
  deactivate(tx: PrismaTx, tenantId: string, gateway?: GatewayKey): Promise<void>;
  updateSettings(
    tx: PrismaTx,
    tenantId: string,
    gateway: GatewayKey,
    settings: GatewayPaymentSettings,
  ): Promise<GatewayConfigRecord | null>;
}
