import { describe, expect, it } from 'vitest';
import {
  fakePort,
  fakeTenantDb,
  MANUAL_REFUND_TENANT_ID,
} from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { ManualRefundWorkflowDisabled } from '../../domain/errors/manual-refund-errors';
import { PauseManualRefundWorkflowUseCase } from './pause-manual-refund-workflow.use-case';

describe('PauseManualRefundWorkflowUseCase', () => {
  it('pauses an enabled workflow without touching refund operations', async () => {
    const settingsWrites: Array<{ paused: boolean }> = [];
    const audits: unknown[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new PauseManualRefundWorkflowUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }),
        setWorkflowPaused: (_tx, _tenantId, paused) => {
          settingsWrites.push({ paused });
          return Promise.resolve();
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    );

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        { reason: 'Suspected finance-account compromise' },
        'platform-admin',
      ),
    ).resolves.toEqual({ enabled: true, paused: true });

    expect(tenantDb.openedFor).toEqual([MANUAL_REFUND_TENANT_ID]);
    expect(settingsWrites).toEqual([{ paused: true }]);
    expect(audits).toEqual([
      expect.objectContaining({
        tenantId: MANUAL_REFUND_TENANT_ID,
        actorUserId: 'platform-admin',
        action: 'manual_refund.workflow_paused',
        entityType: 'tenant',
        entityId: MANUAL_REFUND_TENANT_ID,
        data: { reason: 'Suspected finance-account compromise', severity: 'high' },
      }),
    ]);
  });

  it('rejects a disabled workflow without implicitly enabling it', async () => {
    const settingsWrites: boolean[] = [];
    const useCase = new PauseManualRefundWorkflowUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: false, paused: false }),
        setWorkflowPaused: (_tx, _tenantId, paused) => {
          settingsWrites.push(paused);
          return Promise.resolve();
        },
      }),
      fakePort<IAuditWriter>({}),
      fakeTenantDb().service,
    );

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        { reason: 'Suspected finance-account compromise' },
        'platform-admin',
      ),
    ).rejects.toBeInstanceOf(ManualRefundWorkflowDisabled);
    expect(settingsWrites).toEqual([]);
  });

  it('rejects a blank or too-short audit reason before opening a tenant transaction', async () => {
    const tenantDb = fakeTenantDb();
    const useCase = new PauseManualRefundWorkflowUseCase(
      fakePort<IManualRefundOperationRepository>({}),
      fakePort<IAuditWriter>({}),
      tenantDb.service,
    );

    await expect(
      useCase.execute(MANUAL_REFUND_TENANT_ID, { reason: '  short  ' }, 'platform-admin'),
    ).rejects.toMatchObject({ issues: expect.any(Array) });
    expect(tenantDb.openedFor).toEqual([]);
  });
});
