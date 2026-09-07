import { describe, expect, it } from 'vitest';
import {
  fakePort,
  fakeTenantDb,
  MANUAL_REFUND_TENANT_ID,
} from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { ManualRefundWorkflowDisabled } from '../../domain/errors/manual-refund-errors';
import type { IManualRefundOperationRepository } from '../../domain/ports/manual-refund-operation-repository.port';
import { ResumeManualRefundWorkflowUseCase } from './resume-manual-refund-workflow.use-case';

describe('ResumeManualRefundWorkflowUseCase', () => {
  it('resumes an enabled workflow by clearing only its pause state', async () => {
    const settingsWrites: Array<{ paused: boolean }> = [];
    const audits: unknown[] = [];
    const useCase = new ResumeManualRefundWorkflowUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: true }),
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
      fakeTenantDb().service,
    );

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        { reason: 'Finance-account incident has been contained' },
        'platform-admin',
      ),
    ).resolves.toEqual({ enabled: true, paused: false });

    expect(settingsWrites).toEqual([{ paused: false }]);
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'manual_refund.workflow_resumed',
        data: { reason: 'Finance-account incident has been contained', severity: 'high' },
      }),
    ]);
  });

  it('is idempotent when the enabled workflow is already resumed', async () => {
    const settingsWrites: boolean[] = [];
    const useCase = new ResumeManualRefundWorkflowUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: true, paused: false }),
        setWorkflowPaused: (_tx, _tenantId, paused) => {
          settingsWrites.push(paused);
          return Promise.resolve();
        },
      }),
      fakePort<IAuditWriter>({ write: () => Promise.resolve() }),
      fakeTenantDb().service,
    );

    await expect(
      useCase.execute(
        MANUAL_REFUND_TENANT_ID,
        { reason: 'Finance-account incident has been contained' },
        'platform-admin',
      ),
    ).resolves.toEqual({ enabled: true, paused: false });
    expect(settingsWrites).toEqual([false]);
  });

  it('rejects a disabled workflow without implicitly enabling it', async () => {
    const settingsWrites: boolean[] = [];
    const useCase = new ResumeManualRefundWorkflowUseCase(
      fakePort<IManualRefundOperationRepository>({
        getWorkflowState: () => Promise.resolve({ enabled: false, paused: true }),
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
        { reason: 'Finance-account incident has been contained' },
        'platform-admin',
      ),
    ).rejects.toBeInstanceOf(ManualRefundWorkflowDisabled);
    expect(settingsWrites).toEqual([]);
  });
});
