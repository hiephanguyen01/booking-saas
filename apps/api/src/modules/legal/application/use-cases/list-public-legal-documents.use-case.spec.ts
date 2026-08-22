import { describe, expect, it } from 'vitest';
import type { Locale } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../../tenancy/domain/ports/tenant-repository.port';
import type {
  DocumentRow,
  ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';
import { ListPublicLegalDocumentsUseCase } from './list-public-legal-documents.use-case';

const TENANT_ID = 'tenant-1';

const document = (docType: string, overrides: Record<string, unknown> = {}): DocumentRow =>
  ({
    id: `doc-${docType}`,
    docType,
    currentVersionId: 'version-1',
    versions: [
      {
        id: 'version-1',
        versionNo: 1,
        isMaterialChange: true,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        translations: [{ locale: 'vi', title: `T-${docType}`, bodyMd: 'b' }],
      },
    ],
    ...overrides,
  }) as unknown as DocumentRow;

function harness(rows: DocumentRow[], tenant: TenantRecord | null = { id: TENANT_ID, defaultLocale: 'vi' } as TenantRecord) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListPublicLegalDocumentsUseCase(
      fakePort<ILegalDocumentRepository>({ listAll: () => Promise.resolve(rows) }),
      fakePort<ITenantRepository>({ findById: () => Promise.resolve(tenant) }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

describe('ListPublicLegalDocumentsUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase } = harness([], null);

    await expect(useCase.execute(TENANT_ID, 'vi' as Locale)).rejects.toBeInstanceOf(
      TenantNotFound,
    );
  });

  it('SKIPS a document that has never been published', async () => {
    // A drafted-but-unpublished document is not public text.
    const { useCase } = harness([document('customer_terms', { currentVersionId: null })]);

    await expect(useCase.execute(TENANT_ID, 'vi' as Locale)).resolves.toEqual([]);
  });

  it('skips a document whose current version has vanished', async () => {
    const { useCase } = harness([document('customer_terms', { currentVersionId: 'version-9' })]);

    await expect(useCase.execute(TENANT_ID, 'vi' as Locale)).resolves.toEqual([]);
  });

  it('summarises each published document WITHOUT its body', async () => {
    // The index page lists titles; shipping every document's markdown would
    // make it enormous for no reason.
    const { useCase, tenantDb } = harness([
      document('customer_terms'),
      document('privacy_policy'),
    ]);

    const result = await useCase.execute(TENANT_ID, 'vi' as Locale);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      docType: 'customer_terms',
      versionNo: 1,
      servedLocale: 'vi',
      title: 'T-customer_terms',
    });
    expect(result[0]).not.toHaveProperty('bodyMd');
  });

  it('falls back per document and reports it', async () => {
    const { useCase } = harness([document('customer_terms')]);

    const result = await useCase.execute(TENANT_ID, 'en' as Locale);

    expect(result[0]).toMatchObject({
      requestedLocale: 'en',
      servedLocale: 'vi',
      fellBack: true,
    });
  });
});
