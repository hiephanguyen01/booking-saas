import { describe, expect, it } from 'vitest';
import type { LegalDocumentType, Locale } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../../tenancy/domain/ports/tenant-repository.port';
import { LegalDocumentNotFound } from '../../domain/errors/legal-errors';
import type {
  DocumentRow,
  ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';
import { GetPublicLegalDocumentUseCase } from './get-public-legal-document.use-case';

const TENANT_ID = 'tenant-1';

const version = (no: number, locales: string[], publishedAt: Date | null = new Date('2026-01-01T00:00:00Z')) => ({
  id: `version-${no}`,
  versionNo: no,
  isMaterialChange: true,
  publishedAt,
  translations: locales.map((locale) => ({ locale, title: `T-${locale}`, bodyMd: `B-${locale}` })),
});

const document = (overrides: Record<string, unknown> = {}): DocumentRow =>
  ({
    id: 'doc-1',
    docType: 'customer_terms',
    currentVersionId: 'version-2',
    versions: [version(1, ['vi']), version(2, ['vi', 'en']), version(3, ['vi'], null)],
    ...overrides,
  }) as DocumentRow;

function harness(options: { tenant?: TenantRecord | null; doc?: DocumentRow | null } = {}) {
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetPublicLegalDocumentUseCase(
      fakePort<ILegalDocumentRepository>({
        findByType: () => Promise.resolve(options.doc === undefined ? document() : options.doc),
      }),
      fakePort<ITenantRepository>({
        findById: () =>
          Promise.resolve(
            options.tenant === undefined
              ? ({ id: TENANT_ID, defaultLocale: 'vi' } as TenantRecord)
              : options.tenant,
          ),
      }),
      tenantDb.service,
    ),
    tenantDb,
  };
}

const DOC = 'customer_terms' as LegalDocumentType;

describe('GetPublicLegalDocumentUseCase', () => {
  it('answers not-found for an unknown tenant or document', async () => {
    await expect(
      harness({ tenant: null }).useCase.execute(TENANT_ID, DOC, 'vi' as Locale),
    ).rejects.toBeInstanceOf(TenantNotFound);
    await expect(
      harness({ doc: null }).useCase.execute(TENANT_ID, DOC, 'vi' as Locale),
    ).rejects.toBeInstanceOf(LegalDocumentNotFound);
  });

  it('serves the CURRENT version by default', async () => {
    const { useCase, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, DOC, 'vi' as Locale);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result).toMatchObject({ versionNo: 2, servedLocale: 'vi', fellBack: false });
  });

  it('serves a specific older version when one is asked for', async () => {
    // The acceptance record points at a version number; a customer must be able
    // to re-read exactly what they signed.
    const { useCase } = harness();

    const result = await useCase.execute(TENANT_ID, DOC, 'vi' as Locale, 1);

    expect(result).toMatchObject({ versionNo: 1 });
  });

  it('REFUSES to serve an unpublished draft by number', async () => {
    // The draft exists but nobody has approved it; serving it would present
    // unreviewed terms as binding.
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, DOC, 'vi' as Locale, 3),
    ).rejects.toBeInstanceOf(LegalDocumentNotFound);
  });

  it('answers not-found for a version number that does not exist', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, DOC, 'vi' as Locale, 99),
    ).rejects.toBeInstanceOf(LegalDocumentNotFound);
  });

  it('serves the requested locale when the version has it', async () => {
    const { useCase } = harness();

    const result = await useCase.execute(TENANT_ID, DOC, 'en' as Locale);

    expect(result).toMatchObject({
      requestedLocale: 'en',
      servedLocale: 'en',
      fellBack: false,
      title: 'T-en',
    });
  });

  it("FALLS BACK to the tenant's default locale, and says that it did", async () => {
    // The reader has to know they are looking at a translation they did not ask
    // for, not silently be handed one.
    const { useCase } = harness({
      doc: document({ currentVersionId: 'version-1' }),
    });

    const result = await useCase.execute(TENANT_ID, DOC, 'en' as Locale);

    expect(result).toMatchObject({
      requestedLocale: 'en',
      servedLocale: 'vi',
      fellBack: true,
    });
  });
});
