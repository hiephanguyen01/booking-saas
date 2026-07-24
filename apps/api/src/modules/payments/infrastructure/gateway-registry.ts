import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { GatewayKey, PaymentGatewayPort } from '../domain/ports/payment-gateway.port';
import type { GatewayRegistryPort } from '../domain/ports/gateway-registry.port';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../domain/ports/gateway-config-repository.port';
import { MockGatewayAdapter } from './gateways/mock-gateway.adapter';
import { MomoGatewayAdapter } from './gateways/momo-gateway.adapter';
import { PayosGatewayAdapter } from './gateways/payos-gateway.adapter';
import { SepayGatewayAdapter } from './gateways/sepay-gateway.adapter';
import { ZalopayGatewayAdapter } from './gateways/zalopay-gateway.adapter';

/**
 * Picks the gateway adapter for a tenant (§11.1). Falls back to the mock when no
 * config is present (dev/test). PayOS is bound to the tenant's decrypted creds.
 */
@Injectable()
export class GatewayRegistry implements GatewayRegistryPort {
  constructor(
    private readonly mock: MockGatewayAdapter,
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
  ) {}

  /** Creds-free adapter for `peekReference` (before the tenant is known). */
  statelessByKey(key: GatewayKey): PaymentGatewayPort {
    if (key === 'sepay') {
      return new SepayGatewayAdapter({
        merchantId: 'peek',
        secretKey: 'peek',
        environment: 'sandbox',
      });
    }
    if (key === 'payos') {
      return new PayosGatewayAdapter({ clientId: '', apiKey: '', checksumKey: '' });
    }
    if (key === 'momo') {
      // peekReference only parses the IPN body — no credentials needed.
      return new MomoGatewayAdapter({
        partnerCode: '',
        accessKey: '',
        secretKey: '',
        environment: 'sandbox',
      });
    }
    if (key === 'zalopay') {
      return new ZalopayGatewayAdapter({ appId: '', key1: '', key2: '', environment: 'sandbox' });
    }
    return this.mock;
  }

  async resolveForTenant(
    tx: PrismaTx,
    tenantId: string,
    gateway?: GatewayKey,
  ): Promise<PaymentGatewayPort> {
    const cfg = gateway
      ? await this.configs.findByGateway(tx, tenantId, gateway)
      : await this.configs.findActiveBase(tx, tenantId);
    if (!cfg || cfg.gateway === 'mock') return this.mock;
    if (cfg.gateway === 'sepay') {
      return new SepayGatewayAdapter({
        merchantId: cfg.credentials.merchantId,
        secretKey: cfg.credentials.secretKey,
        environment: cfg.environment,
      });
    }
    if (cfg.gateway === 'momo') {
      return new MomoGatewayAdapter({
        partnerCode: cfg.credentials.partnerCode,
        accessKey: cfg.credentials.accessKey,
        secretKey: cfg.credentials.secretKey,
        environment: cfg.environment,
      });
    }
    if (cfg.gateway === 'zalopay') {
      return new ZalopayGatewayAdapter({
        appId: cfg.credentials.appId,
        key1: cfg.credentials.key1,
        key2: cfg.credentials.key2,
        environment: cfg.environment,
      });
    }
    return new PayosGatewayAdapter({
      clientId: cfg.credentials.clientId,
      apiKey: cfg.credentials.apiKey,
      checksumKey: cfg.credentials.checksumKey,
      baseUrl: cfg.credentials.baseUrl,
    });
  }
}
