import { Inject, Injectable } from '@nestjs/common';
import {
  defaultGatewayPaymentSettings,
  gatewayKeySchema,
  gatewayPaymentSettingsSchema,
  isWalletGateway,
  upsertGatewayConfigInputSchema,
  WALLET_GATEWAYS,
  type GatewayPaymentSettings,
} from '@booking/contracts';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { GatewayKey } from '../../domain/ports/payment-gateway.port';
import { CRYPTO, type CryptoPort } from '../../domain/ports/crypto.port';
import type {
  GatewayConfigRecord,
  IGatewayConfigRepository,
  UpsertGatewayConfigData,
} from '../../domain/ports/gateway-config-repository.port';

type Row = Prisma.TenantGatewayConfigGetPayload<Record<string, never>>;

/** Credentials are stored as a single AES-GCM blob under `credentials.enc`. */
@Injectable()
export class PrismaGatewayConfigRepository implements IGatewayConfigRepository {
  constructor(@Inject(CRYPTO) private readonly crypto: CryptoPort) {}

  private toRecord(c: Row): GatewayConfigRecord {
    const enc = (c.credentials as { enc?: string } | null)?.enc;
    const credentials: unknown = enc ? JSON.parse(this.crypto.decrypt(enc)) : {};
    const gateway = gatewayKeySchema.safeParse(c.gateway);
    if (!gateway.success) {
      throw new Error(`Unsupported stored payment gateway: ${c.gateway}`);
    }
    const parsedSettings = gatewayPaymentSettingsSchema.safeParse(c.settings);
    const parsed = upsertGatewayConfigInputSchema.safeParse({
      gateway: gateway.data,
      environment: c.environment,
      credentials,
      settings: parsedSettings.success
        ? parsedSettings.data
        : defaultGatewayPaymentSettings(gateway.data),
    });
    if (!parsed.success) {
      // Stored/decrypted secrets are a trust boundary. Never coerce missing
      // fields to empty strings and send them to a provider.
      throw new Error(`Invalid stored ${gateway.data} gateway credentials`);
    }
    return { id: c.id, ...parsed.data } as GatewayConfigRecord;
  }

  private async lockTenant(tx: PrismaTx, tenantId: string): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('gateway-config:' || ${tenantId}))`,
    );
  }

  async findActiveAll(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord[]> {
    const rows = await tx.tenantGatewayConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c) => this.toRecord(c));
  }

  async findActiveBase(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord | null> {
    const c = await tx.tenantGatewayConfig.findFirst({
      where: { tenantId, isActive: true, gateway: { notIn: [...WALLET_GATEWAYS] } },
      orderBy: { createdAt: 'asc' },
    });
    return c ? this.toRecord(c) : null;
  }

  async findByGateway(
    tx: PrismaTx,
    tenantId: string,
    gateway: GatewayKey,
  ): Promise<GatewayConfigRecord | null> {
    const c = await tx.tenantGatewayConfig.findFirst({
      where: { tenantId, gateway },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
    return c ? this.toRecord(c) : null;
  }

  async findById(
    tx: PrismaTx,
    tenantId: string,
    id: string,
  ): Promise<GatewayConfigRecord | null> {
    const c = await tx.tenantGatewayConfig.findFirst({ where: { id, tenantId } });
    return c ? this.toRecord(c) : null;
  }

  async upsert(
    tx: PrismaTx,
    tenantId: string,
    data: UpsertGatewayConfigData,
  ): Promise<GatewayConfigRecord> {
    await this.lockTenant(tx, tenantId);

    // Preserve the latest non-secret policy when an admin rotates credentials or
    // reactivates a gateway after temporarily switching providers. Only a gateway
    // with no historical revision at all falls back to provider defaults.
    const previous = await tx.tenantGatewayConfig.findFirst({
      where: { tenantId, gateway: data.gateway },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    const previousRecord = previous ? this.toRecord(previous) : null;

    // BASE gateways stay max-1-active as a group; wallets run in parallel but each
    // wallet must itself be single-active. The tenant advisory lock makes the
    // deactivate/create pair safe under concurrent base-gateway saves.
    await tx.tenantGatewayConfig.updateMany({
      where: {
        tenantId,
        isActive: true,
        ...(isWalletGateway(data.gateway)
          ? { gateway: data.gateway }
          : { gateway: { notIn: [...WALLET_GATEWAYS] } }),
      },
      data: { isActive: false },
    });

    const c = await tx.tenantGatewayConfig.create({
      data: {
        tenantId,
        gateway: data.gateway,
        environment: data.environment,
        credentials: { enc: this.crypto.encrypt(JSON.stringify(data.credentials)) },
        settings: (data.settings ??
          previousRecord?.settings ??
          defaultGatewayPaymentSettings(data.gateway)) as Prisma.InputJsonObject,
        isActive: true,
      },
    });
    return this.toRecord(c);
  }

  async deactivate(tx: PrismaTx, tenantId: string, gateway?: GatewayKey): Promise<void> {
    await tx.tenantGatewayConfig.updateMany({
      where: { tenantId, isActive: true, ...(gateway ? { gateway } : {}) },
      data: { isActive: false },
    });
  }

  async updateSettings(
    tx: PrismaTx,
    tenantId: string,
    gateway: GatewayKey,
    settings: GatewayPaymentSettings,
  ): Promise<GatewayConfigRecord | null> {
    await this.lockTenant(tx, tenantId);

    const current = await tx.tenantGatewayConfig.findFirst({
      where: { tenantId, gateway, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!current) return null;
    const currentRecord = this.toRecord(current);

    await tx.tenantGatewayConfig.updateMany({
      where: { tenantId, gateway, isActive: true },
      data: { isActive: false },
    });

    const successor = await tx.tenantGatewayConfig.create({
      data: {
        tenantId,
        gateway: currentRecord.gateway,
        environment: currentRecord.environment,
        credentials: { enc: this.crypto.encrypt(JSON.stringify(currentRecord.credentials)) },
        settings: settings as Prisma.InputJsonObject,
        isActive: true,
      },
    });
    return this.toRecord(successor);
  }
}
