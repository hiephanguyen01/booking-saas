import { describe, expect, it } from 'vitest';
import type { LegalDocumentType } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../../tenancy/domain/ports/tenant-repository.port';
import { LegalDocumentNotFound } from '../../domain/errors/legal-errors';
import type {
  DocumentRow,
  ILegalDocumentRepository,
} from '../../domain/ports/legal-document-repository.port';
import { WithdrawLegalDocumentUseCase } from './withdraw-legal-document.use-case';

const TENANT_ID = 'tenant-1';

const document = (overrides: Record<string, unknown> = {}): DocumentRow =>
  ({
    id: 'doc-1',
    docType: 'partner_terms',
    currentVersionId: 'version-1',
    versions: [
      {
        id: 'version-1',
        versionNo: 1,
        isMaterialChange: true,
        publishedAt: new Date(),
        translations: [{ locale: 'vi', title: 't', bodyMd: 'b' }],
      },
    ],
    ...overrides,
  }) as DocumentRow;

function harness(options: { tenant?: TenantRecord | null; doc?: DocumentRow | null; all?: DocumentRow[] } = {}) {
  const withdrawn: Array<{ tenantId: string; documentId: string }> = [];
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
    useCase: new WithdrawLegalDocumentUseCase(
      fakePort<ILegalDocumentRepository>({
        findByType: () => Promise.resolve(options.doc === undefined ? document() : options.doc),
        withdraw: (_tx, tenantId, documentId) => {
          withdrawn.push({ tenantId, documentId });
          return Promise.resolve();
        },
        listAll: () => Promise.resolve(options.all ?? []),
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
    withdrawn,
    events,
  };
}

describe('WithdrawLegalDocumentUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase, withdrawn } = harness({ tenant: null });

    await expect(
      useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType),
    ).rejects.toBeInstanceOf(TenantNotFound);
    expect(withdrawn).toEqual([]);
  });

  it('answers not-found for a document the tenant does not have', async () => {
    const { useCase, withdrawn } = harness({ doc: null });

    await expect(
      useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType),
    ).rejects.toBeInstanceOf(LegalDocumentNotFound);
    expect(withdrawn).toEqual([]);
  });

  it('withdraws the document and RE-ANNOUNCES readiness', async () => {
    // Withdrawing can take the storefront dark, so the tenancy columns must
    // move with it — in the same transaction as the withdrawal.
    const { useCase, withdrawn, events, tenantDb } = harness();

    await useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(withdrawn).toEqual([{ tenantId: TENANT_ID, documentId: 'doc-1' }]);
    expect(events).toEqual([
      {
        eventType: 'legal.readiness_changed',
        payload: { legalReady: false, publishedCount: 0 },
      },
    ]);
  });

  it('counts the remaining documents when it recomputes readiness', async () => {
    const { useCase, events } = harness({
      all: [document({ docType: 'customer_terms' }), document({ docType: 'privacy_policy' })],
    });

    await useCase.execute(TENANT_ID, 'partner_terms' as LegalDocumentType);

    expect(events[0]?.payload).toMatchObject({ legalReady: false, publishedCount: 2 });
  });
});
