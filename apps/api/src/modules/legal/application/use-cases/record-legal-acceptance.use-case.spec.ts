import { describe, expect, it } from 'vitest';
import type { LegalDocumentType } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../../tenancy/domain/ports/tenant-repository.port';
import { LegalConsentRequired, LegalVersionStale } from '../../domain/errors/legal-errors';
import type { IAgreementAcceptanceRepository } from '../../domain/ports/agreement-acceptance-repository.port';
import type {
  DocumentRow,
  ILegalDocumentRepository,
  VersionRow,
} from '../../domain/ports/legal-document-repository.port';
import {
  RecordLegalAcceptanceUseCase,
  type RecordLegalAcceptanceArgs,
} from './record-legal-acceptance.use-case';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';

const version = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'version-1',
    versionNo: 3,
    isMaterialChange: true,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    docType: 'partner_terms',
    translations: [{ locale: 'vi', title: 'Điều khoản', bodyMd: '...' }],
    ...overrides,
  }) as VersionRow & { docType: LegalDocumentType };

const document = (overrides: Record<string, unknown> = {}): DocumentRow =>
  ({
    id: 'doc-1',
    docType: 'partner_terms',
    currentVersionId: 'version-1',
    versions: [],
    ...overrides,
  }) as DocumentRow;

interface Options {
  version?: (VersionRow & { docType: LegalDocumentType }) | null;
  doc?: DocumentRow | null;
  tenant?: TenantRecord | null;
}

function harness(options: Options = {}) {
  const recorded: Array<Record<string, unknown>> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new RecordLegalAcceptanceUseCase(
      fakePort<ILegalDocumentRepository>({
        findVersionById: () =>
          Promise.resolve(options.version === undefined ? version() : options.version),
        findByType: () => Promise.resolve(options.doc === undefined ? document() : options.doc),
      }),
      fakePort<IAgreementAcceptanceRepository>({
        record: (_tx, entry) => {
          recorded.push(entry as unknown as Record<string, unknown>);
          return Promise.resolve();
        },
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
    recorded,
  };
}

const tx = fakeTx({});

const args = (overrides: Partial<RecordLegalAcceptanceArgs> = {}) =>
  ({
    tenantId: TENANT_ID,
    userId: USER_ID,
    partnerId: null,
    acceptedVersionIds: ['version-1'],
    requestedLocale: 'vi',
    ...overrides,
  }) as RecordLegalAcceptanceArgs;

describe('RecordLegalAcceptanceUseCase', () => {
  it('composes into a CALLER-owned transaction when given one', async () => {
    // Signing has to commit with the business operation it authorises, so the
    // use case must not open its own scope in that case.
    const { useCase, tenantDb } = harness();

    await useCase.execute(tx, args());

    expect(tenantDb.openedFor).toEqual([]);
  });

  it('opens its own transaction when called standalone', async () => {
    const { useCase, tenantDb } = harness();

    await useCase.execute(null, args());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('refuses an UNPUBLISHED version — a draft is not a signable document', async () => {
    const { useCase, recorded } = harness({ version: version({ publishedAt: null }) });

    await expect(useCase.execute(tx, args())).rejects.toBeInstanceOf(LegalVersionStale);
    expect(recorded).toEqual([]);
  });

  it('refuses a version that is no longer CURRENT — a stale tab', async () => {
    // A signature for text nobody saw is worse than no signature.
    const { useCase, recorded } = harness({ doc: document({ currentVersionId: 'version-9' }) });

    await expect(useCase.execute(tx, args())).rejects.toBeInstanceOf(LegalVersionStale);
    expect(recorded).toEqual([]);
  });

  it('ACCEPTS a superseded version when the caller says the clock merely moved', async () => {
    // The registration handler runs up to ~40 minutes after the tick; re-applying
    // the stale check there could only fail forever and dead-letter the row.
    const { useCase, recorded } = harness({ doc: document({ currentVersionId: 'version-9' }) });

    await useCase.execute(tx, args({ acceptSupersededVersions: true }));

    expect(recorded).toHaveLength(1);
  });

  it('records the version NUMBER and the locale actually rendered', async () => {
    const { useCase, recorded } = harness();

    await useCase.execute(tx, args({ ip: '203.0.113.9' }));

    expect(recorded).toEqual([
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        partnerId: null,
        agreementType: 'partner_terms',
        documentVersionId: 'version-1',
        acceptedLocale: 'vi',
        version: '3',
        ip: '203.0.113.9',
      },
    ]);
  });

  it('stores a null ip rather than undefined when the caller had none', async () => {
    // `undefined` is what Prisma reads as "do not set", which on an insert
    // silently drops the column instead of writing NULL.
    const { useCase, recorded } = harness();

    await useCase.execute(tx, args());

    expect(recorded[0]).toMatchObject({ ip: null });
  });

  it("falls back to the TENANT's default locale when the version lacks the requested one", async () => {
    // The signature has to say which text was on screen, which is the fallback,
    // not what the browser asked for.
    const { useCase, recorded } = harness({
      version: version({ translations: [{ locale: 'vi', title: 'x', bodyMd: 'y' }] }),
    });

    await useCase.execute(tx, args({ requestedLocale: 'en' }));

    expect(recorded[0]).toMatchObject({ acceptedLocale: 'vi' });
  });

  it('spends no tenant read when the requested locale exists', async () => {
    // The common case must not pay for the fallback lookup.
    const { useCase, recorded } = harness({ tenant: null });

    await useCase.execute(tx, args({ requestedLocale: 'vi' }));

    expect(recorded).toHaveLength(1);
  });

  it('answers not-found when the fallback needs a tenant that is gone', async () => {
    const { useCase } = harness({ tenant: null });

    await expect(
      useCase.execute(tx, args({ requestedLocale: 'en' })),
    ).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('ENFORCES the required document types server-side', async () => {
    // The browser tick is a UX affordance; a scripted request must not create a
    // partner with no partner-terms signature.
    const { useCase } = harness({
      version: version({ docType: 'privacy_policy' }),
      doc: document({ docType: 'privacy_policy' }),
    });

    await expect(
      useCase.execute(tx, args({ requiredDocTypes: ['partner_terms'] })),
    ).rejects.toBeInstanceOf(LegalConsentRequired);
  });

  it('checks coverage AFTER the writes, so the rollback takes the whole operation', async () => {
    // Throwing before writing would leave the transaction able to commit the
    // business operation without them.
    const { useCase, recorded } = harness({
      version: version({ docType: 'privacy_policy' }),
      doc: document({ docType: 'privacy_policy' }),
    });

    await expect(
      useCase.execute(tx, args({ requiredDocTypes: ['partner_terms'] })),
    ).rejects.toBeInstanceOf(LegalConsentRequired);
    expect(recorded).toHaveLength(1);
  });

  it('accepts several versions in one go, one row each', async () => {
    const { useCase, recorded } = harness();

    await useCase.execute(tx, args({ acceptedVersionIds: ['version-1', 'version-1'] }));

    expect(recorded).toHaveLength(2);
  });
});
