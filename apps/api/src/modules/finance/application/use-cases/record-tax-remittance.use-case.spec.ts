import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import {
  InvalidTaxDocumentKey,
  TaxFilingConcurrentChange,
  TaxFilingHasNoPayableAmount,
  TaxFilingNotFound,
  TaxRemittanceAmountMismatch,
  TaxDocumentUploadExpired,
  TaxDocumentUploadInvalid,
} from '../../domain/errors/finance-domain-errors';
import type {
  ITaxComplianceRepository,
  TaxFilingPeriodRecord,
} from '../../domain/ports/tax-compliance-repository.port';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import { RecordTaxRemittanceUseCase } from './record-tax-remittance.use-case';

const TENANT_ID = 'tenant-1';
const PERIOD_ID = 'period-1';
const FILE_KEY = `tax-documents/${TENANT_ID}/2f1a9d3c-4b5e-4f6a-9c8d-0e1f2a3b4c5d.pdf`;
const CHECKSUM = 'sha256:abc';
const NOW = new Date('2026-09-05T00:00:00Z');
const VAT = 50_000n;
const PIT = 20_000n;

const period = (overrides: Record<string, unknown> = {}): TaxFilingPeriodRecord =>
  ({
    id: PERIOD_ID,
    tenantId: TENANT_ID,
    taxYear: 2026,
    taxMonth: 8,
    status: 'submitted',
    vatAmount: VAT,
    pitAmount: PIT,
    ...overrides,
  }) as unknown as TaxFilingPeriodRecord;

const upload = (overrides: Record<string, unknown> = {}) => ({
  id: 'upload-1',
  status: 'pending',
  checksum: CHECKSUM,
  sizeBytes: 12_345,
  contentType: 'application/pdf',
  expiresAt: new Date('2026-09-06T00:00:00Z'),
  ...overrides,
});

interface Options {
  record?: TaxFilingPeriodRecord | null;
  inspection?: Record<string, unknown>;
  uploadRow?: ReturnType<typeof upload> | null;
  attached?: boolean;
  paid?: TaxFilingPeriodRecord | null;
}

function harness(options: Options = {}) {
  const journals: Array<Record<string, unknown>> = [];
  const remittances: Array<Record<string, unknown>> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new RecordTaxRemittanceUseCase(
      fakePort<ITaxComplianceRepository>({
        findPeriod: () => Promise.resolve(options.record === undefined ? period() : options.record),
        findDocumentUpload: () =>
          Promise.resolve(
            (options.uploadRow === undefined ? upload() : options.uploadRow) as never,
          ),
        attachDocumentUpload: () => Promise.resolve(options.attached ?? true),
        recordRemittance: (_tx, _tenantId, _periodId, expectedStatus, data) => {
          remittances.push({ expectedStatus, data: data as unknown as Record<string, unknown> });
          return Promise.resolve(
            (options.paid === undefined ? period({ status: 'paid' }) : options.paid) as never,
          );
        },
      }),
      fakePort<ILedgerRepository>({
        recordJournal: (_tx, _tenantId, _legs, meta) => {
          journals.push(meta as Record<string, unknown>);
          return Promise.resolve('journal-remittance');
        },
      }),
      fakePort<StoragePort>({
        inspectPrivatePdf: () =>
          Promise.resolve(
            (options.inspection ?? {
              valid: true,
              checksum: CHECKSUM,
              sizeBytes: 12_345,
              contentType: 'application/pdf',
            }) as never,
          ),
      }),
      tenantDb.service,
    ),
    tenantDb,
    journals,
    remittances,
  };
}

const input = (overrides: Record<string, unknown> = {}) => ({
  vatAmount: VAT,
  pitAmount: PIT,
  paymentReference: 'NOP-2026-08',
  paidAt: NOW,
  ...overrides,
});

describe('RecordTaxRemittanceUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses evidence stored outside this tenant's tax folder", async () => {
    const { useCase, tenantDb } = harness();

    await expect(
      useCase.execute(
        TENANT_ID,
        PERIOD_ID,
        input({ evidence: { fileKey: 'other/x.pdf' } }),
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(InvalidTaxDocumentKey);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('rejects a period this tenant does not have', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, PERIOD_ID, input(), 'staff-1')).rejects.toBeInstanceOf(
      TaxFilingNotFound,
    );
  });

  it('refuses to record payment on a period that was never submitted', async () => {
    const { useCase } = harness({ record: period({ status: 'draft' }) });

    await expect(useCase.execute(TENANT_ID, PERIOD_ID, input(), 'staff-1')).rejects.toThrow();
  });

  it('refuses a period with nothing payable', async () => {
    const { useCase } = harness({ record: period({ vatAmount: 0n, pitAmount: 0n }) });

    await expect(
      useCase.execute(TENANT_ID, PERIOD_ID, input({ vatAmount: 0n, pitAmount: 0n }), 'staff-1'),
    ).rejects.toBeInstanceOf(TaxFilingHasNoPayableAmount);
  });

  it.each([
    ['VAT', { vatAmount: 49_000n }],
    ['PIT', { pitAmount: 19_000n }],
  ])('refuses when the operator typed a different %s figure', async (_label, mismatch) => {
    // The amounts are the ones the period computed; a typed figure that disagrees
    // would book a journal the filing does not support.
    const { useCase, journals } = harness();

    await expect(
      useCase.execute(TENANT_ID, PERIOD_ID, input(mismatch), 'staff-1'),
    ).rejects.toBeInstanceOf(TaxRemittanceAmountMismatch);
    expect(journals).toEqual([]);
  });

  it('books the remittance journal and stamps the period, with no evidence at all', async () => {
    // Evidence is optional; the ledger movement is not.
    const { useCase, tenantDb, journals, remittances } = harness();

    await useCase.execute(TENANT_ID, PERIOD_ID, input(), 'staff-1');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(journals[0]).toMatchObject({ memo: 'tax.remittance:2026-08' });
    expect(remittances[0]).toMatchObject({
      expectedStatus: 'submitted',
      data: { journalId: 'journal-remittance', recordedBy: 'staff-1', evidence: null },
    });
  });

  it('verifies an attached PDF against its registered checksum', async () => {
    const { useCase } = harness({
      uploadRow: upload({ checksum: 'sha256:different' }),
    });

    await expect(
      useCase.execute(TENANT_ID, PERIOD_ID, input({ evidence: { fileKey: FILE_KEY } }), 'staff-1'),
    ).rejects.toBeInstanceOf(TaxDocumentUploadInvalid);
  });

  it('refuses an attached PDF whose claim window has lapsed', async () => {
    const { useCase } = harness({
      uploadRow: upload({ expiresAt: new Date('2026-09-01T00:00:00Z') }),
    });

    await expect(
      useCase.execute(TENANT_ID, PERIOD_ID, input({ evidence: { fileKey: FILE_KEY } }), 'staff-1'),
    ).rejects.toBeInstanceOf(TaxDocumentUploadExpired);
  });

  it('claims the evidence upload so it cannot back a second filing', async () => {
    const { useCase, remittances } = harness();

    await useCase.execute(
      TENANT_ID,
      PERIOD_ID,
      input({ evidence: { fileKey: FILE_KEY, note: 'nộp qua VCB' } }),
      'staff-1',
    );

    expect(remittances[0]).toMatchObject({
      data: { evidence: { fileKey: FILE_KEY, note: 'nộp qua VCB' } },
    });
  });

  it('fails when the evidence was claimed concurrently', async () => {
    const { useCase, journals } = harness({ attached: false });

    await expect(
      useCase.execute(TENANT_ID, PERIOD_ID, input({ evidence: { fileKey: FILE_KEY } }), 'staff-1'),
    ).rejects.toBeInstanceOf(TaxFilingConcurrentChange);
    expect(journals).toEqual([]);
  });

  it('fails when the guarded period write matched no row', async () => {
    const { useCase } = harness({ paid: null });

    await expect(useCase.execute(TENANT_ID, PERIOD_ID, input(), 'staff-1')).rejects.toBeInstanceOf(
      TaxFilingConcurrentChange,
    );
  });
});
