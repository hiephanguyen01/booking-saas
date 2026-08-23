import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type {
  GatewayConfigRecord,
  IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import type {
  PayosWebhookConfiguratorPort,
  PayosWebhookCredentials,
} from '../../domain/ports/payos-webhook-configurator.port';
import { ConfirmPayosWebhookUseCase } from './confirm-payos-webhook.use-case';

const TENANT_ID = 'tenant-1';
const CREDENTIALS = Object.freeze({}) as PayosWebhookCredentials;
const CONFIG = {
  id: 'payos-config-1',
  gateway: 'payos',
  environment: 'production',
  credentials: CREDENTIALS,
  settings: { refundStrategy: 'manual', manualRefundSlaHours: 72 },
} as GatewayConfigRecord;

describe('ConfirmPayosWebhookUseCase', () => {
  it('loads active PayOS credentials in tenant scope, then confirms outside the transaction', async () => {
    let transactionOpen = false;
    const tenantDb = fakeTenantDb({
      onOpen: () => {
        transactionOpen = true;
      },
      onClose: () => {
        transactionOpen = false;
      },
    });
    const confirmedWith: PayosWebhookCredentials[] = [];
    const configs = fakePort<IGatewayConfigRepository>({
      findActiveByGateway: (_tx, tenantId, gateway) => {
        expect(transactionOpen).toBe(true);
        expect(tenantId).toBe(TENANT_ID);
        expect(gateway).toBe('payos');
        return Promise.resolve(CONFIG);
      },
    });
    const configurator = fakePort<PayosWebhookConfiguratorPort>({
      confirm: (credentials) => {
        expect(transactionOpen).toBe(false);
        confirmedWith.push(credentials);
        return Promise.resolve({
          verified: true as const,
          webhookUrl: 'https://api.booking.test/webhooks/payos',
        });
      },
    });
    const useCase = new ConfirmPayosWebhookUseCase(
      configs,
      fakeTenantContext(TENANT_ID),
      tenantDb.service,
      configurator,
    );

    await expect(useCase.execute()).resolves.toEqual({
      verified: true,
      webhookUrl: 'https://api.booking.test/webhooks/payos',
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(confirmedWith).toEqual([CREDENTIALS]);
  });
});
