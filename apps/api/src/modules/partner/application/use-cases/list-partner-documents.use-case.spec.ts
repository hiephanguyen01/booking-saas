import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import type { IPartnerRepository, PartnerRecord } from '../../domain/ports/partner-repository.port';
import {
  ListPartnerDocumentsUseCase,
  type PartnerDocumentViewer,
} from './list-partner-documents.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const KEY = `partner-documents/partners/${PARTNER_ID}/11111111-1111-4111-8111-111111111111.png`;

interface Options {
  partner?: PartnerRecord | null;
}

function harness(options: Options = {}) {
  const auditWrites: unknown[] = [];
  const downloadCalls: unknown[] = [];
  const tenantDb = fakeTenantDb();

  return {
    useCase: new ListPartnerDocumentsUseCase(
      fakePort<IPartnerRepository>({
        findById: () =>
          Promise.resolve(
            options.partner === undefined
              ? ({
                  id: PARTNER_ID,
                  tenantId: TENANT_ID,
                  businessInfo: {
                    licenseDocumentKeys: [KEY],
                  },
                } as unknown as PartnerRecord)
              : options.partner,
          ),
      }),
      fakePort<StoragePort>({
        createPrivatePresignedDownload: (opts) => {
          downloadCalls.push(opts);
          return Promise.resolve({
            downloadUrl: 'https://storage/download-doc',
            expiresInSec: 300,
          });
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          auditWrites.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    auditWrites,
    downloadCalls,
    tenantDb,
  };
}

const viewer: PartnerDocumentViewer = { actorType: 'partner', actorId: 'user-1' };

describe('ListPartnerDocumentsUseCase', () => {
  it('throws PartnerNotFound when partner does not exist', async () => {
    const { useCase } = harness({ partner: null });

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, viewer)).rejects.toBeInstanceOf(
      PartnerNotFound,
    );
  });

  it('lists partner private documents with presigned download URLs and records audit log', async () => {
    const { useCase, auditWrites, downloadCalls, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, viewer);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(downloadCalls).toEqual([{ key: KEY }]);
    expect(auditWrites).toHaveLength(1);
    expect(result).toEqual([
      {
        storage: 'private',
        kind: 'license_document',
        key: KEY,
        downloadUrl: 'https://storage/download-doc',
        expiresInSec: 300,
      },
    ]);
  });
});
