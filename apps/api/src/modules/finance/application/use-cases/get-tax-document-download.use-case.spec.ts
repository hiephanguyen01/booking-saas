import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import {
  TaxCertificateDocumentUnavailable,
  TaxCertificateNotFound,
  TaxDocumentUploadInvalid,
} from '../../domain/errors/finance-domain-errors';
import type {
  ITaxComplianceRepository,
  TaxCertificateRecord,
} from '../../domain/ports/tax-compliance-repository.port';
import { GetTaxDocumentDownloadUseCase } from './get-tax-document-download.use-case';

const TENANT_ID = 'tenant-1';
const CERTIFICATE_ID = 'cert-1';
const PARTNER_ID = 'partner-1';
const CHECKSUM = 'sha256:abc';

const certificate = (overrides: Partial<TaxCertificateRecord> = {}): TaxCertificateRecord =>
  ({
    id: CERTIFICATE_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    taxYear: 2026,
    certificateNumber: 'CT-2026-0001',
    status: 'issued',
    fileKey: `tax-documents/${TENANT_ID}/2f1a9d3c-4b5e-4f6a-9c8d-0e1f2a3b4c5d.pdf`,
    checksum: CHECKSUM,
    ...overrides,
  }) as unknown as TaxCertificateRecord;

interface Options {
  record?: TaxCertificateRecord | null;
  inspection?: { valid: boolean; checksum: string };
}

function harness(options: Options = {}) {
  const audits: AuditEntry[] = [];
  const downloads: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetTaxDocumentDownloadUseCase(
      fakePort<ITaxComplianceRepository>({
        findCertificate: () =>
          Promise.resolve(options.record === undefined ? certificate() : options.record),
      }),
      fakePort<StoragePort>({
        inspectPrivatePdf: () =>
          Promise.resolve((options.inspection ?? { valid: true, checksum: CHECKSUM }) as never),
        createPrivatePresignedDownload: (input) => {
          downloads.push(input);
          return Promise.resolve({ url: 'https://s3/get', expiresInSec: 300 } as never);
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    audits,
    downloads,
  };
}

const tenantViewer = { actorId: 'staff-1', actorType: 'tenant' as const };
const partnerViewer = { actorId: 'user-1', actorType: 'partner' as const, partnerId: PARTNER_ID };

describe('GetTaxDocumentDownloadUseCase', () => {
  it('rejects a certificate this tenant does not have', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, CERTIFICATE_ID, tenantViewer)).rejects.toBeInstanceOf(
      TaxCertificateNotFound,
    );
  });

  it("rejects a partner asking for another partner's certificate", async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, CERTIFICATE_ID, {
        actorId: 'user-2',
        actorType: 'partner',
        partnerId: 'partner-2',
      }),
    ).rejects.toBeInstanceOf(TaxCertificateNotFound);
  });

  it('lets the tenant read a VOIDED certificate but not the partner', async () => {
    // The tenant needs the withdrawn evidence for its own trail; handing it to the
    // partner would look like a live certificate.
    const voided = { record: certificate({ status: 'voided' }) };

    await expect(
      harness(voided).useCase.execute(TENANT_ID, CERTIFICATE_ID, tenantViewer),
    ).resolves.toBeDefined();
    await expect(
      harness(voided).useCase.execute(TENANT_ID, CERTIFICATE_ID, partnerViewer),
    ).rejects.toBeInstanceOf(TaxCertificateDocumentUnavailable);
  });

  it('refuses a certificate that has no stored document yet', async () => {
    const { useCase } = harness({ record: certificate({ fileKey: null }) });

    await expect(useCase.execute(TENANT_ID, CERTIFICATE_ID, tenantViewer)).rejects.toBeInstanceOf(
      TaxCertificateDocumentUnavailable,
    );
  });

  it("refuses a file key that is not under this tenant's tax prefix", async () => {
    // Belt and braces over RLS: a key pointing at another tenant's folder must not
    // be signed even if it somehow reached this row.
    const { useCase } = harness({
      record: certificate({
        fileKey: 'tax-documents/tenant-2/2f1a9d3c-4b5e-4f6a-9c8d-0e1f2a3b4c5d.pdf',
      }),
    });

    await expect(useCase.execute(TENANT_ID, CERTIFICATE_ID, tenantViewer)).rejects.toBeInstanceOf(
      TaxCertificateDocumentUnavailable,
    );
  });

  it('refuses to sign a document whose bytes no longer match the issued checksum', async () => {
    // The certificate is evidence: if the object changed after issue, the link
    // must not be handed out.
    const { useCase } = harness({ inspection: { valid: true, checksum: 'sha256:tampered' } });

    await expect(useCase.execute(TENANT_ID, CERTIFICATE_ID, tenantViewer)).rejects.toBeInstanceOf(
      TaxDocumentUploadInvalid,
    );
  });

  it('audits the request and signs a named download', async () => {
    const { useCase, tenantDb, audits, downloads } = harness();

    await useCase.execute(TENANT_ID, CERTIFICATE_ID, partnerViewer);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(audits[0]).toMatchObject({
      action: 'tax_certificate.download_requested',
      entityId: CERTIFICATE_ID,
      data: { viewerType: 'partner', partnerId: PARTNER_ID },
    });
    expect(downloads[0]).toMatchObject({ fileName: 'chung-tu-khau-tru-CT-2026-0001.pdf' });
  });
});
