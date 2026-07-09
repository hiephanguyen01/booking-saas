import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { GatewayKey, PaymentGatewayPort } from '../domain/ports/payment-gateway.port';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../domain/ports/gateway-config-repository.port';
import { MockGatewayAdapter } from './gateways/mock-gateway.adapter';
import { PayosGatewayAdapter } from './gateways/payos-gateway.adapter';

/**
 * Picks the gateway adapter for a tenant (§11.1). Falls back to the mock when no
 * config is present (dev/test). PayOS is bound to the tenant's decrypted creds.
 */
@Injectable()
export class GatewayRegistry {
  constructor(
    private readonly mock: MockGatewayAdapter,
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
  ) {}

  /** Creds-free adapter for `peekReference` (before the tenant is known). */
  statelessByKey(key: GatewayKey): PaymentGatewayPort {
    return key === 'payos'
      ? new PayosGatewayAdapter({ clientId: '', apiKey: '', checksumKey: '' })
      : this.mock;
  }

  async resolveForTenant(tx: PrismaTx, tenantId: string): Promise<PaymentGatewayPort> {
    const cfg = await this.configs.findActive(tx, tenantId);
    if (!cfg || cfg.gateway === 'mock') return this.mock;
    return new PayosGatewayAdapter({
      clientId: cfg.credentials.clientId ?? '',
      apiKey: cfg.credentials.apiKey ?? '',
      checksumKey: cfg.credentials.checksumKey ?? '',
      baseUrl: cfg.credentials.baseUrl,
    });
  }
}
