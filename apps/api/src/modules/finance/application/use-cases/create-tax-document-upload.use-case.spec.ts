import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  PrivatePresignedUpload,
  StoragePort,
} from '../../../storage/domain/ports/storage.port';
import type { ITaxComplianceRepository } from '../../domain/ports/tax-compliance-repository.port';
import { CreateTaxDocumentUploadUseCase } from './create-tax-document-upload.use-case';

const TENANT_ID = 'tenant-1';
const NOW = new Date('2026-08-19T10:00:00Z');

function harness() {
  const grants: unknown[] = [];
  const records: unknown[] = [];
  const grant = {
    key: `tax/${TENANT_ID}/abc.pdf`,
    uploadUrl: 'https://s3/put',
    expiresInSec: 900,
  } as unknown as PrivatePresignedUpload;
  const tenantDb = fakeTenantDb();
  return {
    useCase: new CreateTaxDocumentUploadUseCase(
      fakePort<StoragePort>({
        createPrivatePresignedUpload: (input) => {
          grants.push(input);
          return Promise.resolve(grant);
        },
      }),
      fakePort<ITaxComplianceRepository>({
        createDocumentUpload: (_tx, _tenantId, data) => {
          records.push(data);
          return Promise.resolve(null as never);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    grants,
    records,
    grant,
  };
}

const input = {
  contentType: 'application/pdf',
  sizeBytes: 12_345,
  checksum: 'sha256:abc',
} as const;

describe('CreateTaxDocumentUploadUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mints a PRIVATE, write-once grant under the tenant tax prefix', async () => {
    // A tax document is evidence: it must not be publicly readable, and it must
    // not be replaceable once written, or the trail can be rewritten after filing.
    const { useCase, grants, grant } = harness();

    await expect(useCase.execute(TENANT_ID, input)).resolves.toBe(grant);
    expect(grants[0]).toMatchObject({
      contentType: 'application/pdf',
      contentLength: 12_345,
      writeOnce: true,
    });
    expect((grants[0] as { keyPrefix: string }).keyPrefix).toContain(TENANT_ID);
  });

  it('records the expected object with its checksum and a 24-hour claim window', async () => {
    // The record is what lets the confirm step verify the bytes match what was
    // promised; it expires so an unclaimed grant does not linger as a valid key.
    const { useCase, tenantDb, records } = harness();

    await useCase.execute(TENANT_ID, input);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(records[0]).toEqual({
      objectKey: `tax/${TENANT_ID}/abc.pdf`,
      checksum: 'sha256:abc',
      sizeBytes: 12_345,
      contentType: 'application/pdf',
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });
  });
});
