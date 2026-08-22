import { describe, expect, it } from 'vitest';
import type { CreateContentReportInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import {
  ContentReportValidationError,
  ReporterNotFound,
  ReportTargetNotFound,
} from '../../domain/errors/content-report-errors';
import type { IContentReportRepository } from '../../domain/ports/content-report-repository.port';
import type { IContentReportTenantReader } from '../../domain/ports/content-report-tenant-reader.port';
import { CreateContentReportUseCase } from './create-content-report.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const REPORTER = 'user-1';

const target = {
  target: 'listing',
  id: 'listing-1',
  title: 'Studio A',
  slug: 'studio-a',
  partnerId: 'partner-1',
  partnerName: 'Giang Studio',
};

const stored = () =>
  ({
    id: 'report-1',
    target: 'listing',
    targetId: 'listing-1',
    status: 'open',
    reason: 'duplicate_or_spam',
    details: null,
    reporterUserId: REPORTER,
    reporterName: 'Ann',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  }) as never;

interface Options {
  tenantId?: string | null;
  targetRow?: unknown;
  reporterName?: string | null;
  duplicate?: boolean;
}

function harness(options: Options = {}) {
  const created: unknown[] = [];
  const tenantDb = fakeTenantDb();
  const useCase = new CreateContentReportUseCase(
    fakePort<IContentReportRepository>({
      findPublishedTarget: () =>
        Promise.resolve((options.targetRow === undefined ? target : options.targetRow) as never),
      getReporterName: () =>
        Promise.resolve(options.reporterName === undefined ? 'Ann' : options.reporterName),
      createOrFindActive: (_tx, _tenantId, data) => {
        created.push(data);
        return Promise.resolve({
          report: stored(),
          duplicate: options.duplicate ?? false,
        } as never);
      },
    }),
    fakePort<IContentReportTenantReader>({
      resolveTenantId: () =>
        Promise.resolve(options.tenantId === undefined ? TENANT_ID : options.tenantId),
    }),
    tenantDb.service,
  );
  return { useCase, tenantDb, created };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    target: 'listing',
    targetId: 'listing-1',
    reason: 'duplicate_or_spam',
    ...overrides,
  }) as CreateContentReportInput;

describe('CreateContentReportUseCase', () => {
  it('refuses a host that resolves to no tenant', async () => {
    const { useCase, tenantDb } = harness({ tenantId: null });

    await expect(useCase.execute(HOST, REPORTER, input())).rejects.toBeInstanceOf(TenantNotFound);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('refuses a target that is not published on this tenant', async () => {
    // Reporting is only possible against content the reporter could actually see;
    // otherwise the endpoint confirms the existence of unpublished ids.
    const { useCase, created } = harness({ targetRow: null });

    await expect(useCase.execute(HOST, REPORTER, input())).rejects.toBeInstanceOf(
      ReportTargetNotFound,
    );
    expect(created).toEqual([]);
  });

  it('refuses a reporter who does not exist on this tenant', async () => {
    const { useCase } = harness({ reporterName: null });

    await expect(useCase.execute(HOST, REPORTER, input())).rejects.toBeInstanceOf(ReporterNotFound);
  });

  it('freezes the target and reporter names onto the report', async () => {
    // The moderation queue must still read sensibly after the listing is renamed
    // or the partner leaves, so the names are copied rather than joined later.
    const { useCase, tenantDb, created } = harness();

    await useCase.execute(HOST, REPORTER, input());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      target: 'listing',
      targetId: 'listing-1',
      targetTitle: 'Studio A',
      partnerId: 'partner-1',
      partnerName: 'Giang Studio',
      reporterUserId: REPORTER,
      reporterName: 'Ann',
      reason: 'duplicate_or_spam',
      details: null,
    });
  });

  it("requires a real description when the reason is 'other'", async () => {
    const { useCase, created } = harness();

    await expect(
      useCase.execute(HOST, REPORTER, input({ reason: 'other', details: 'xấu' })),
    ).rejects.toBeInstanceOf(ContentReportValidationError);
    expect(created).toEqual([]);
  });

  it('reports a repeat submission as a duplicate rather than a new report', async () => {
    // Two clicks on the same report button must not open two queue entries.
    const { useCase } = harness({ duplicate: true });

    await expect(useCase.execute(HOST, REPORTER, input())).resolves.toMatchObject({
      duplicate: true,
    });
  });

  it('normalises an empty description to null', async () => {
    const { useCase, created } = harness();

    await useCase.execute(HOST, REPORTER, input({ details: '' }));

    expect(created[0]).toMatchObject({ details: null });
  });
});
