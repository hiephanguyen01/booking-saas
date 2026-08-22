import { describe, expect, it } from 'vitest';
import type { UpdateContentReportInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import {
  ContentReportInvalidTransition,
  ContentReportNotFound,
  ContentReportStateChanged,
  ContentReportValidationError,
} from '../../domain/errors/content-report-errors';
import type { IContentReportRepository } from '../../domain/ports/content-report-repository.port';
import { UpdateContentReportUseCase } from './update-content-report.use-case';

const TENANT_ID = 'tenant-1';
const REPORT_ID = 'report-1';
const ACTOR = 'staff-1';
const NOW = new Date('2026-08-19T10:00:00Z');

const state = (status = 'open') =>
  ({
    id: REPORT_ID,
    target: 'listing',
    targetId: 'listing-1',
    status,
    reason: 'spam',
    details: null,
    reporterUserId: 'user-1',
    reporterName: 'Ann',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  }) as never;

function harness(record: unknown, saved: unknown = state('reviewing')) {
  const audits: AuditEntry[] = [];
  const tenantDb = fakeTenantDb({ now: NOW });
  return {
    useCase: new UpdateContentReportUseCase(
      fakePort<IContentReportRepository>({
        loadForModeration: () => Promise.resolve(record as never),
        saveModeration: () => Promise.resolve(saved as never),
      }),
      tenantDb.service,
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
    ),
    tenantDb,
    audits,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({ status: 'reviewing', ...overrides }) as UpdateContentReportInput;

describe('UpdateContentReportUseCase', () => {
  it('answers 404 for a report this tenant does not have', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, REPORT_ID, ACTOR, input())).rejects.toBeInstanceOf(
      ContentReportNotFound,
    );
  });

  it('moves an open report into review and audits who did it', async () => {
    const { useCase, tenantDb, audits } = harness(state('open'));

    await useCase.execute(TENANT_ID, REPORT_ID, ACTOR, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(audits[0]).toMatchObject({
      tenantId: TENANT_ID,
      actorUserId: ACTOR,
      action: 'content_report.status_changed',
      entityType: 'content_report',
      entityId: REPORT_ID,
      data: { fromStatus: 'open', toStatus: 'reviewing', targetType: 'listing' },
    });
  });

  it('refuses to jump straight from open to resolved', async () => {
    // Someone has to actually look at it; the intermediate state is the record
    // that a human picked it up.
    const { useCase, audits } = harness(state('open'));

    await expect(
      useCase.execute(
        TENANT_ID,
        REPORT_ID,
        ACTOR,
        input({ status: 'resolved', resolutionNote: 'đã gỡ nội dung vi phạm' }),
      ),
    ).rejects.toBeInstanceOf(ContentReportInvalidTransition);
    expect(audits).toEqual([]);
  });

  it('requires a real note before closing a report', async () => {
    // The note is the answer the reporter and the partner get; "ok" is not one.
    const { useCase } = harness(state('reviewing'));

    await expect(
      useCase.execute(
        TENANT_ID,
        REPORT_ID,
        ACTOR,
        input({ status: 'resolved', resolutionNote: 'ok' }),
      ),
    ).rejects.toBeInstanceOf(ContentReportValidationError);
  });

  it('closes a reviewed report with its note', async () => {
    const { useCase, audits } = harness(state('reviewing'), state('resolved'));

    await useCase.execute(
      TENANT_ID,
      REPORT_ID,
      ACTOR,
      input({ status: 'resolved', resolutionNote: 'đã gỡ nội dung vi phạm' }),
    );

    expect(audits[0]).toMatchObject({
      data: {
        fromStatus: 'reviewing',
        toStatus: 'resolved',
        resolutionNote: 'đã gỡ nội dung vi phạm',
      },
    });
  });

  it('fails when the guarded save matched no row', async () => {
    // Two moderators on the same report: the second must be told, not silently
    // credited with a change it did not make.
    const { useCase, audits } = harness(state('open'), null);

    await expect(useCase.execute(TENANT_ID, REPORT_ID, ACTOR, input())).rejects.toBeInstanceOf(
      ContentReportStateChanged,
    );
    expect(audits).toEqual([]);
  });
});
