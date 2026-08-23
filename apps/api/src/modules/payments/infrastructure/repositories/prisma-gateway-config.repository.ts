import { Inject, Injectable } from '@nestjs/common';
import {
  defaultGatewayPaymentSettings,
  gatewayKeySchema,
  gatewayPaymentSettingsSchema,
  upsertGatewayConfigInputSchema,
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
import {
  PAYMENT_CONFIGURATION_LOCK,
  type PaymentConfigurationLockPort,
} from '../../domain/ports/payment-configuration-lock.port';

type Row = Prisma.TenantGatewayConfigGetPayload<Record<string, never>>;

/** Credentials are stored as a single AES-GCM blob under `credentials.enc`. */
@Injectable()
export class PrismaGatewayConfigRepository implements IGatewayConfigRepository {
  constructor(
    @Inject(CRYPTO) private readonly crypto: CryptoPort,
    @Inject(PAYMENT_CONFIGURATION_LOCK)
    private readonly configurationLock: PaymentConfigurationLockPort,
  ) {}

  private toRecord(c: Row): GatewayConfigRecord {
    const enc = (c.credentials as { enc?: string } | null)?.enc;
    const credentials: unknown = enc ? JSON.parse(this.crypto.decrypt(enc)) : {};
    const gateway = gatewayKeySchema.safeParse(c.gateway);
    if (!gateway.success) {
      throw new Error(`Unsupported stored payment gateway: ${c.gateway}`);
    }
    const parsed = upsertGatewayConfigInputSchema.safeParse({
      gateway: gateway.data,
      environment: c.environment,
      credentials,
    });
    if (!parsed.success) {
      throw new Error(`Invalid stored ${gateway.data} gateway credentials`);
    }
    const parsedSettings = gatewayPaymentSettingsSchema.safeParse(c.settings);
    const settings = parsedSettings.success
      ? parsedSettings.data
      : defaultGatewayPaymentSettings(gateway.data);
    return { id: c.id, ...parsed.data, settings } as GatewayConfigRecord;
  }

  async findActiveAll(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord[]> {
    const rows = await tx.tenantGatewayConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c) => this.toRecord(c));
  }

  async findActiveByGateway(
    tx: PrismaTx,
    tenantId: string,
    gateway: GatewayKey,
  ): Promise<GatewayConfigRecord | null> {
    const c = await tx.tenantGatewayConfig.findFirst({
      where: { tenantId, gateway, isActive: true },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
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
    await this.configurationLock.acquire(tx, tenantId);

    // Preserve the latest legacy settings only for historical-refund compatibility.
    // Current routing and refund policy live in their own tenant tables.
    const previous = await tx.tenantGatewayConfig.findFirst({
      where: { tenantId, gateway: data.gateway },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    const previousRecord = previous ? this.toRecord(previous) : null;

    // Provider revisions are independent: rotating PayOS never deactivates SePay,
    // and vice versa. The partial unique DB index remains the final same-provider guard.
    await tx.tenantGatewayConfig.updateMany({
      where: { tenantId, gateway: data.gateway, isActive: true },
      data: { isActive: false },
    });

    const c = await tx.tenantGatewayConfig.create({
      data: {
        tenantId,
        gateway: data.gateway,
        environment: data.environment,
        credentials: { enc: this.crypto.encrypt(JSON.stringify(data.credentials)) },
        settings: (previousRecord?.settings ??
          defaultGatewayPaymentSettings(data.gateway)) as Prisma.InputJsonObject,
        isActive: true,
      },
    });
    return this.toRecord(c);
  }

  async deactivate(tx: PrismaTx, tenantId: string, gateway?: GatewayKey): Promise<void> {
    await this.configurationLock.acquire(tx, tenantId);
    await tx.tenantGatewayConfig.updateMany({
      where: { tenantId, isActive: true, ...(gateway ? { gateway } : {}) },
      data: { isActive: false },
    });
  }
}