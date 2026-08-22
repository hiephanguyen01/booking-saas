import { describe, expect, it } from 'vitest';
import type { LegalDocumentType, PublishLegalDocumentInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../../tenancy/domain/ports/tenant-repository.port';
import {
  LegalDefaultLocaleRequired,
  LegalDocumentNotFound,
  LegalDraftMissing,
} from '../../domain/errors/legal-errors';
import type {
  DocumentRow,
  ILegalDocumentRepository,
  PublishData,
} from '../../domain/ports/legal-document-repository.port';
import { PublishLegalDocumentUseCase } from './publish-legal-document.use-case';

const TENANT_ID = 'tenant-1';
const CTX = { userId: 'user-admin' };

const draft = (locales: string[] = ['vi']) => ({
  id: 'version-draft',
  versionNo: 0,
  isMaterialChange: false,
  publishedAt: null,
  translations: locales.map((locale) => ({ locale, title: 't', bodyMd: 'b' })),
});

const published = (versionNo: number, locales: string[] = ['vi']) => ({
  id: `version-${versionNo}`,
  versionNo,
  isMaterialChange: true,
  publishedAt: new Date('2026-01-01T00:00:00Z'),
  translations: locales.map((locale) => ({ locale, title: 't', bodyMd: 'b' })),
});

const document = (overrides: Record<string, unknown> = {}): DocumentRow =>
  ({
    id: 'doc-1',
    docType: 'partner_terms',
    currentVersionId: 'version-2',
    versions: [published(1), published(2), draft()],
    ...overrides,
  }) as DocumentRow;

interface Options {
  tenant?: TenantRecord | null;
  doc?: DocumentRow | null;
  publishOk?: boolean;
  all?: DocumentRow[];
}

function harness(options: Options = {}) {
  const publishes: PublishData[] = [];
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
    useCase: new PublishLegalDocumentUseCase(
      fakePort<ILegalDocumentRepository>({
        findByType: () => Promise.resolve(options.doc === undefined ? document() : options.doc),
        publish: (_tx, data) => {
          publishes.push(data);
          return Promise.resolve(options.publishOk ?? true);
        },
        listAll: () => Promise.resolve(options.all ?? [document()]),
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
      new OutboxService(),
    ),
    tenantDb,
    publishes,
    events,
  };
}

const input = (material: boolean) => ({ material }) as PublishLegalDocumentInput;

describe('PublishLegalDocumentUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase, publishes } = harness({ tenant: null });

    await expect(
      useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(true), CTX),
    ).rejects.toBeInstanceOf(TenantNotFound);
    expect(publishes).toEqual([]);
  });

  it('answers not-found for a document the tenant does not have', async () => {
    const { useCase } = harness({ doc: null });

    await expect(
      useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(true), CTX),
    ).rejects.toBeInstanceOf(LegalDocumentNotFound);
  });

  it('refuses when there is no draft to publish', async () => {
    const { useCase } = harness({ doc: document({ versions: [published(1)] }) });

    await expect(
      useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(true), CTX),
    ).rejects.toBeInstanceOf(LegalDraftMissing);
  });

  it("REFUSES a draft missing the tenant's DEFAULT locale", async () => {
    // The storefront falls back to it, so a document without it is unreadable
    // for most visitors.
    const { useCase, publishes } = harness({
      doc: document({ versions: [draft(['en'])] }),
    });

    await expect(
      useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(true), CTX),
    ).rejects.toBeInstanceOf(LegalDefaultLocaleRequired);
    expect(publishes).toEqual([]);
  });

  it('numbers the new version after the highest PUBLISHED one', async () => {
    // The draft's own placeholder number must not be counted.
    const { useCase, publishes, tenantDb } = harness();

    await useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(true), CTX);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(publishes).toEqual([
      {
        tenantId: TENANT_ID,
        documentId: 'doc-1',
        draftVersionId: 'version-draft',
        versionNo: 3,
        isMaterialChange: true,
        publishedByUserId: 'user-admin',
      },
    ]);
  });

  it('starts at version ONE for a first publish', async () => {
    const { useCase, publishes } = harness({
      doc: document({ currentVersionId: null, versions: [draft()] }),
    });

    await useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(true), CTX);

    expect(publishes[0]).toMatchObject({ versionNo: 1 });
  });

  it('LOSES a concurrent second publish rather than restamping', async () => {
    // Restamping would rewrite an already-published version's material flag,
    // silently imposing or retracting a re-acceptance requirement.
    const { useCase, events } = harness({ publishOk: false });

    await expect(
      useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(true), CTX),
    ).rejects.toBeInstanceOf(LegalDraftMissing);
    expect(events).toEqual([]);
  });

  it('announces a MATERIAL change so partners are asked to re-accept', async () => {
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(true), CTX);

    expect(events[0]).toEqual({
      eventType: 'legal.document_published',
      payload: {
        docType: 'partner_terms',
        versionId: 'version-draft',
        versionNo: 3,
        isMaterialChange: true,
      },
    });
  });

  it('announces NOTHING for a cosmetic fix — nobody has to sign again', async () => {
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(false), CTX);

    expect(events.map((e) => e.eventType)).toEqual(['legal.readiness_changed']);
  });

  it('recomputes readiness HERE and ships it as a payload', async () => {
    // tenancy's handler writes two columns and imports nothing from legal,
    // which is what keeps the module graph acyclic.
    const { useCase, events } = harness({ all: [document()] });

    await useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(false), CTX);

    expect(events.at(-1)).toEqual({
      eventType: 'legal.readiness_changed',
      payload: { legalReady: false, publishedCount: 1 },
    });
  });

  it('counts readiness from the CURRENT version, in the default locale', async () => {
    // A document whose current version lacks the default locale is not ready,
    // however many drafts it has.
    const { useCase, events } = harness({
      all: [
        document({ id: 'd1', docType: 'partner_terms', currentVersionId: 'version-2' }),
        // Its CURRENT version is English-only; the Vietnamese draft behind it
        // has not been reviewed, so it must not count towards readiness.
        document({
          id: 'd2',
          docType: 'customer_terms',
          currentVersionId: 'version-2',
          versions: [published(2, ['en']), draft(['vi'])],
        }),
      ],
    });

    await useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType, input(false), CTX);

    expect(events.at(-1)?.payload).toMatchObject({ publishedCount: 1 });
  });
});
