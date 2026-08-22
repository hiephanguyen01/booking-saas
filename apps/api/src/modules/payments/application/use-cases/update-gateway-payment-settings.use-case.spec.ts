import { describe, expect, it } from 'vitest';
import type { UpdateGatewayPaymentSettingsInput } from '@booking/contracts';
import { fakePort, fakeTenantContext, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  GatewayConfigNotFound,
  UnsupportedPaymentMethod,
} from '../../domain/errors/gateway-config-errors';
import type { IGatewayConfigRepository } from '../../domain/ports/gateway-config-repository.port';
import { UpdateGatewayPaymentSettingsUseCase } from './update-gateway-payment-settings.use-case';

const TENANT_ID = 'tenant-1';

function harness(updated: { id: string } | null = { id: 'config-1' }) {
  const settings: unknown[] = [];
  const audits: AuditEntry[] = [];
  const tenantDb = fakeTenantDb();
  const useCase = new UpdateGatewayPaymentSettingsUseCase(
    fakePort<IGatewayConfigRepository>({
      updateSettings: (_tx, _tenantId, _gateway, data) => {
        settings.push(data);
        return Promise.resolve(updated as never);
      },
    }),
    fakePort<IAuditWriter>({
      write: (_tx, entry) => {
        audits.push(entry);
        return Promise.resolve();
      },
    }),
    fakeTenantContext(TENANT_ID),
    tenantDb.service,
  );
  return { useCase, tenantDb, settings, audits };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    gateway: 'sepay',
    enabledMethods: ['bank_transfer', 'napas_qr'],
    refundStrategy: 'automatic_preferred',
    manualRefundSlaHours: 48,
    ...overrides,
  }) as unknown as UpdateGatewayPaymentSettingsInput;

describe('UpdateGatewayPaymentSettingsUseCase', () => {
  it('updates the policy without touching the stored credentials', async () => {
    // Only the three non-secret fields are written; a settings change must not
    // force a credential rotation.
    const { useCase, tenantDb, settings } = harness();

    await useCase.execute(input(), 'admin-1');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(settings).toEqual([
      {
        enabledMethods: ['bank_transfer', 'napas_qr'],
        refundStrategy: 'automatic_preferred',
        manualRefundSlaHours: 48,
      },
    ]);
  });

  it('refuses a method the gateway cannot process', async () => {
    // SePay takes no wallet payments; enabling one would offer the customer a
    // method that dead-ends at checkout.
    const { useCase, settings } = harness();

    await expect(
      useCase.execute(input({ enabledMethods: ['bank_transfer', 'momo_wallet'] }), 'admin-1'),
    ).rejects.toBeInstanceOf(UnsupportedPaymentMethod);
    expect(settings).toEqual([]);
  });

  it('rejects an update to a gateway the tenant has not configured', async () => {
    const { useCase, audits } = harness(null);

    await expect(useCase.execute(input(), 'admin-1')).rejects.toBeInstanceOf(GatewayConfigNotFound);
    expect(audits).toEqual([]);
  });

  it('audits the change against the acting user', async () => {
    const { useCase, audits } = harness();

    await useCase.execute(input(), 'admin-1');

    expect(audits[0]).toMatchObject({
      tenantId: TENANT_ID,
      actorUserId: 'admin-1',
      action: 'payment.settings_updated',
      entityType: 'tenant_gateway_config',
      entityId: 'config-1',
    });
  });
});
