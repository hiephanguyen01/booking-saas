import type { ManualRefundWorkflowState } from '@booking/contracts';
import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';

import type {
  ManualRefundReadinessCheck,
  ManualRefundReadinessPort,
} from '../../domain/ports/manual-refund-readiness.port';
import { GetManualRefundReadinessUseCase } from './get-manual-refund-readiness.use-case';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('GetManualRefundReadinessUseCase', () => {
  it('returns readiness checks and false ready status when any check fails', async () => {
    const tenantDb = fakeTenantDb();
    const workflow: ManualRefundWorkflowState = { enabled: false, paused: false };

    const checks: ManualRefundReadinessCheck[] = [
      { key: 'pii_keyring', ok: true },
      { key: 'pii_active_key', ok: true },
      { key: 'pii_fingerprint_key', ok: true },
      { key: 'private_storage', ok: true },
      { key: 'schema', ok: true },
      { key: 'system_role_permissions', ok: false, reason: 'missing_permissions' },
      { key: 'worker_enabled', ok: true },
    ];

    const useCase = new GetManualRefundReadinessUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve(workflow),
      }),
      fakePort<ManualRefundReadinessPort>({
        inspect: () => Promise.resolve(checks),
      }),
      tenantDb.service,
    );

    const result = await useCase.execute(TENANT_ID);

    expect(result).toEqual({
      ready: false,
      workflow: { enabled: false, paused: false },
      checks: [
        { key: 'pii_keyring', ok: true },
        { key: 'pii_active_key', ok: true },
        { key: 'pii_fingerprint_key', ok: true },
        { key: 'private_storage', ok: true },
        { key: 'schema', ok: true },
        { key: 'system_role_permissions', ok: false, reason: 'missing_permissions' },
        { key: 'worker_enabled', ok: true },
      ],
    });

    const serializedWithoutCheckName = JSON.stringify(result).replaceAll('pii_fingerprint_key', '');
    const forbiddenSubstrings = [
      'destinationAccount',
      'fingerprint',
      'objectKey',
      'presigned',
      'secret',
    ];
    for (const forbidden of forbiddenSubstrings) {
      expect(serializedWithoutCheckName.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('returns ready true when all readiness checks pass', async () => {
    const tenantDb = fakeTenantDb();
    const workflow: ManualRefundWorkflowState = { enabled: true, paused: false };

    const checks: ManualRefundReadinessCheck[] = [
      { key: 'pii_keyring', ok: true },
      { key: 'pii_active_key', ok: true },
      { key: 'pii_fingerprint_key', ok: true },
      { key: 'private_storage', ok: true },
      { key: 'schema', ok: true },
      { key: 'system_role_permissions', ok: true },
      { key: 'worker_enabled', ok: true },
    ];

    const useCase = new GetManualRefundReadinessUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve(workflow),
      }),
      fakePort<ManualRefundReadinessPort>({
        inspect: () => Promise.resolve(checks),
      }),
      tenantDb.service,
    );

    const result = await useCase.execute(TENANT_ID);

    expect(result).toEqual({
      ready: true,
      workflow: { enabled: true, paused: false },
      checks,
    });
  });
});
