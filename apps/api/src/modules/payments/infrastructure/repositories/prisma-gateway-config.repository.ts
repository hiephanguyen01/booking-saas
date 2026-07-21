import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_GATEWAY_PAYMENT_SETTINGS,
  gatewayPaymentSettingsSchema,
  type GatewayPaymentSettings,
} from '@booking/contracts';
import type { Prisma } from '@prisma/client';
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
    const credentials = enc ? (JSON.parse(this.crypto.decrypt(enc)) as Record<string, string>) : {};
    const parsedSettings = gatewayPaymentSettingsSchema.safeParse(c.settings);
    return {
      id: c.id,
      gateway: c.gateway as GatewayKey,
      environment: c.environment,
      credentials,
      settings: parsedSettings.success ? parsedSettings.data : DEFAULT_GATEWAY_PAYMENT_SETTINGS,
    };
  }

  async findActive(tx: PrismaTx, tenantId: string): Promise<GatewayConfigRecord | null> {
    const c = await tx.tenantGatewayConfig.findFirst({ where: { tenantId, isActive: true } });
    return c ? this.toRecord(c) : null;
  }

  async findByGateway(
    tx: PrismaTx,
    tenantId: string,
    gateway: GatewayKey,
  ): Promise<GatewayConfigRecord | null> {
    const c = await tx.tenantGatewayConfig.findFirst({
      where: { tenantId, gateway },
      orderBy: { updatedAt: 'desc' },
    });
    return c ? this.toRecord(c) : null;
  }

  async upsert(
    tx: PrismaTx,
    tenantId: string,
    data: UpsertGatewayConfigData,
  ): Promise<GatewayConfigRecord> {
    const credentials = { enc: this.crypto.encrypt(JSON.stringify(data.credentials)) };
    await tx.tenantGatewayConfig.updateMany({
      where: { tenantId, isActive: true },
      data: { isActive: false },
    });
    const c = await tx.tenantGatewayConfig.upsert({
      where: {
        tenantId_gateway_environment: {
          tenantId,
          gateway: data.gateway,
          environment: data.environment,
        },
      },
      create: {
        tenantId,
        gateway: data.gateway,
        environment: data.environment,
        credentials,
        settings: (data.settings ?? DEFAULT_GATEWAY_PAYMENT_SETTINGS) as Prisma.InputJsonObject,
        isActive: true,
      },
      update: {
        credentials,
        ...(data.settings ? { settings: data.settings as Prisma.InputJsonObject } : {}),
        isActive: true,
      },
    });
    return this.toRecord(c);
  }

  async updateSettings(
    tx: PrismaTx,
    tenantId: string,
    settings: GatewayPaymentSettings,
  ): Promise<GatewayConfigRecord | null> {
    const current = await tx.tenantGatewayConfig.findFirst({
      where: { tenantId, isActive: true },
      select: { id: true },
    });
    if (!current) return null;
    const updated = await tx.tenantGatewayConfig.update({
      where: { id: current.id },
      data: { settings: settings as Prisma.InputJsonObject },
    });
    return this.toRecord(updated);
  }
}
