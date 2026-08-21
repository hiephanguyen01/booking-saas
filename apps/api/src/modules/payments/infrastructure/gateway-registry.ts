import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_GATEWAY_PAYMENT_SETTINGS } from '@booking/contracts';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { GatewayKey, PaymentGatewayPort } from '../domain/ports/payment-gateway.port';
import type {
  GatewayRegistryPort,
  PaymentGatewayResolutionInput,
  ResolvedGateway,
} from '../domain/ports/gateway-registry.port';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type GatewayConfigRecord,
  type IGatewayConfigRepository,
} from '../domain/ports/gateway-config-repository.port';
import { MockGatewayAdapter } from './gateways/mock-gateway.adapter';
import { MomoGatewayAdapter } from './gateways/momo-gateway.adapter';
import { PayosGatewayAdapter } from './gateways/payos-gateway.adapter';
import { SepayGatewayAdapter } from './gateways/sepay-gateway.adapter';
import { ZalopayGatewayAdapter } from './gateways/zalopay-gateway.adapter';

/** Resolves active checkout config separately from immutable historical payment config. */
@Injectable()
export class GatewayRegistry implements GatewayRegistryPort {
  private readonly logger = new Logger(GatewayRegistry.name);

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

  async resolveActiveForCheckout(
    tx: PrismaTx,
    tenantId: string,
    gateway?: GatewayKey,
  ): Promise<ResolvedGateway> {
    const cfg = gateway
      ? (await this.configs.findActiveAll(tx, tenantId)).find((candidate) => candidate.gateway === gateway) ??
        null
      : await this.configs.findActiveBase(tx, tenantId);
    return this.resolveConfig(cfg);
  }

  async resolveForPayment(
    tx: PrismaTx,
    payment: PaymentGatewayResolutionInput,
  ): Promise<ResolvedGateway> {
    if (payment.gatewayConfigRevisionId) {
      const cfg = await this.configs.findById(
        tx,
        payment.tenantId,
        payment.gatewayConfigRevisionId,
      );
      if (!cfg) {
        throw new Error(
          `Gateway config revision ${payment.gatewayConfigRevisionId} not found for payment ${payment.id}`,
        );
      }
      if (cfg.gateway !== payment.gateway) {
        throw new Error(
          `Gateway config revision ${cfg.id} does not match payment ${payment.id} gateway ${payment.gateway}`,
        );
      }
      return this.resolveConfig(cfg);
    }

    this.logger.warn(
      `legacy_payment_gateway_resolution paymentId=${payment.id} tenantId=${payment.tenantId} gateway=${payment.gateway}`,
    );
    const cfg = await this.configs.findByGateway(tx, payment.tenantId, payment.gateway);
    return this.resolveConfig(cfg);
  }

  /** Temporary PR1 compatibility seam; all payment-lifecycle callers use resolveForPayment. */
  async resolveForTenant(
    tx: PrismaTx,
    tenantId: string,
    gateway?: GatewayKey,
  ): Promise<PaymentGatewayPort> {
    return (await this.resolveActiveForCheckout(tx, tenantId, gateway)).gateway;
  }

  private resolveConfig(cfg: GatewayConfigRecord | null): ResolvedGateway {
    if (!cfg || cfg.gateway === 'mock') {
      return {
        gateway: this.mock,
        configRevisionId: null,
        settings: DEFAULT_GATEWAY_PAYMENT_SETTINGS,
      };
    }
    return {
      gateway: this.adapterForConfig(cfg),
      configRevisionId: cfg.id,
      settings: cfg.settings,
    };
  }

  private adapterForConfig(cfg: GatewayConfigRecord): PaymentGatewayPort {
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
    if (cfg.gateway === 'payos') {
      return new PayosGatewayAdapter({
        clientId: cfg.credentials.clientId,
        apiKey: cfg.credentials.apiKey,
        checksumKey: cfg.credentials.checksumKey,
        baseUrl: cfg.credentials.baseUrl,
      });
    }
    return this.mock;
  }
}
