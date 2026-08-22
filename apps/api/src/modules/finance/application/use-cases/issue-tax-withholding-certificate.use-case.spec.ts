import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import {
  InvalidTaxDocumentKey,
  TaxCertificateAlreadyIssued,
  TaxCertificateConcurrentChange,
  TaxCertificateNoWithholding,
  TaxCertificateYearNotClosed,
  TaxCertificateYearUnsettled,
  TaxDocumentUploadExpired,
  TaxDocumentUploadInvalid,
} from '../../domain/errors/finance-domain-errors';
import type {
  ITaxComplianceRepository,
  TaxCertificateRecord,
} from '../../domain/ports/tax-compliance-repository.port';
import { IssueTaxWithholdingCertificateUseCase } from './issue-tax-withholding-certificate.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const TAX_YEAR = 2026;
const FILE_KEY = `tax-documents/${TENANT_ID}/2f1a9d3c-4b5e-4f6a-9c8d-0e1f2a3b4c5d.pdf`;
const CHECKSUM = 'sha256:abc';
/** 2027 in Vietnam, so 2026 is a closed tax year. */
const NOW = new Date('2027-03-01T00:00:00Z');

const upload = (overrides: Record<string, unknown> = {}) => ({
  id: 'upload-1',
  status: 'pending',
  checksum: CHECKSUM,
  sizeBytes: 12_345,
  contentType: 'application/pdf',
  expiresAt: new Date('2027-03-02T00:00:00Z'),
  ...overrides,
});

const readiness = (overrides: Record<string, unknown> = {}) => ({
  eventCount: 4,
  unsettledEventCount: 0,
  vatAmount: 50_000n,
  pitAmount: 20_000n,
  ...overrides,
});

interface Options {
  inspection?: Record<string, unknown>;
  uploadRow?: ReturnType<typeof upload> | null;
  readinessRow?: ReturnType<typeof readiness>;
  active?: TaxCertificateRecord | null;
  latest?: TaxCertificateRecord | null;
  attached?: boolean;
}

function harness(options: Options = {}) {
  const created: Array<Record<string, unknown>> = [];
  const audits: AuditEntry[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new IssueTaxWithholdingCertificateUseCase(
      fakePort<ITaxComplianceRepository>({
        lockCertificateYear: () => Promise.resolve(),
        findDocumentUpload: () =>
          Promise.resolve(
            (options.uploadRow === undefined ? upload() : options.uploadRow) as never,
          ),
        certificateReadiness: () => Promise.resolve((options.readinessRow ?? readiness()) as never),
        findActiveCertificate: () => Promise.resolve(options.active ?? null),
        findLatestCertificate: () => Promise.resolve(options.latest ?? null),
        attachDocumentUpload: () => Promise.resolve(options.attached ?? true),
        createCertificate: (_tx, _tenantId, _partnerId, _year, data) => {
          created.push(data as unknown as Record<string, unknown>);
          return Promise.resolve({
            id: 'cert-new',
            partnerId: PARTNER_ID,
            taxYear: TAX_YEAR,
            ...(data as object),
          } as unknown as TaxCertificateRecord);
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
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      new OutboxService(),
      tenantDb.service,
    ),
    tenantDb,
    created,
    audits,
    events,
  };
}

const input = { certificateNumber: 'CT-2026-0001', fileKey: FILE_KEY };

describe('IssueTaxWithholdingCertificateUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a file key outside this tenant's tax folder", async () => {
    const { useCase, tenantDb } = harness();

    await expect(
      useCase.execute(
        TENANT_ID,
        PARTNER_ID,
        TAX_YEAR,
        { ...input, fileKey: 'other/x.pdf' },
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(InvalidTaxDocumentKey);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('refuses a tax year that has not closed yet', async () => {
    // The certificate totals a whole year of withholding; issuing mid-year would
    // certify a number that is still moving.
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, 2027, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxCertificateYearNotClosed);
  });

  it('refuses a PDF that fails inspection', async () => {
    const { useCase } = harness({ inspection: { valid: false, reason: 'not a pdf' } });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxDocumentUploadInvalid);
  });

  it('refuses a file that is not a pending upload of this tenant', async () => {
    const { useCase } = harness({ uploadRow: null });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxDocumentUploadInvalid);
  });

  it('refuses an upload whose claim window has lapsed', async () => {
    const { useCase } = harness({
      uploadRow: upload({ expiresAt: new Date('2027-02-01T00:00:00Z') }),
    });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxDocumentUploadExpired);
  });

  it.each([
    ['checksum', { checksum: 'sha256:different' }],
    ['size', { sizeBytes: 999 }],
    ['content type', { contentType: 'text/plain' }],
  ])('refuses when the stored PDF disagrees on its %s', async (_label, mismatch) => {
    // The bytes must be the ones that were registered, or the certificate
    // certifies a document nobody approved.
    const { useCase } = harness({ uploadRow: upload(mismatch) });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxDocumentUploadInvalid);
  });

  it('refuses a year with no withholding to certify', async () => {
    const { useCase } = harness({ readinessRow: readiness({ eventCount: 0 }) });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxCertificateNoWithholding);
  });

  it('refuses a year whose withholding nets to nothing after reversals', async () => {
    const { useCase } = harness({ readinessRow: readiness({ vatAmount: 0n, pitAmount: 0n }) });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxCertificateNoWithholding);
  });

  it('refuses while any event of the year is still unsettled', async () => {
    // A pending refund could still reverse part of the year; certifying now would
    // hand the partner a figure that changes afterwards.
    const { useCase } = harness({ readinessRow: readiness({ unsettledEventCount: 2 }) });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxCertificateYearUnsettled);
  });

  it('refuses when an active certificate already exists for the year', async () => {
    const { useCase } = harness({ active: { id: 'cert-old' } as TaxCertificateRecord });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxCertificateAlreadyIssued);
  });

  it('fails when the upload was claimed concurrently', async () => {
    const { useCase, created } = harness({ attached: false });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1'),
    ).rejects.toBeInstanceOf(TaxCertificateConcurrentChange);
    expect(created).toEqual([]);
  });

  it('issues version 1 with the totals the year actually withheld', async () => {
    const { useCase, tenantDb, audits, events, created } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created[0]).toMatchObject({
      certificateNumber: 'CT-2026-0001',
      fileKey: FILE_KEY,
      checksum: CHECKSUM,
      issuedBy: 'staff-1',
      version: 1,
      supersedesId: null,
      vatAmount: 50_000n,
      pitAmount: 20_000n,
    });
    expect(audits[0]).toMatchObject({ action: 'tax_certificate.issued' });
    expect(events[0]).toMatchObject({ eventType: 'tax.certificate_issued' });
  });

  it('supersedes the previous certificate rather than replacing it', async () => {
    // A voided certificate stays in the trail; the reissue points back at it.
    const { useCase, created } = harness({
      latest: { id: 'cert-v1', version: 1 } as unknown as TaxCertificateRecord,
    });

    await useCase.execute(TENANT_ID, PARTNER_ID, TAX_YEAR, input, 'staff-1');

    expect(created[0]).toMatchObject({ version: 2, supersedesId: 'cert-v1' });
  });
});
