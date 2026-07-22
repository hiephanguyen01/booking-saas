import { Inject, Injectable } from '@nestjs/common';
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
    return { id: c.id, gateway: c.gateway as GatewayKey, environment: c.environment, credentials };
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
        isActive: true,
      },
      update: { credentials, isActive: true },
    });
    return this.toRecord(c);
  }

  async deactivateAll(tx: PrismaTx, tenantId: string): Promise<void> {
    await tx.tenantGatewayConfig.updateMany({
      where: { tenantId, isActive: true },
      data: { isActive: false },
    });
  }
}
