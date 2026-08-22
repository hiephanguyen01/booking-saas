import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IEmailRenderer } from '../../domain/ports/email-renderer.port';
import type { IEmailSender } from '../../domain/ports/email-sender.port';
import type { INotificationInboxRepository } from '../../domain/ports/notification-inbox-repository.port';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';
import type { INotificationReader } from '../../domain/ports/notification-reader.port';
import {
  DispatchLegalDocumentEventUseCase,
  type LegalDocumentPublishedPayload,
} from './dispatch-legal-document-event.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER = { userId: 'user-partner', email: 'giang@x.vn', name: 'Giang', locale: 'vi' };
const AFFILIATE = { userId: 'user-aff', email: 'aff@x.vn', name: 'Aff', locale: 'en' };

function harness(options: { partners?: unknown[]; affiliates?: unknown[] } = {}) {
  const sent: Array<{ to: string }> = [];
  const rendered: Array<{ templateId: string; locale: string; data: Record<string, unknown> }> = [];
  const dedupeKeys: string[] = [];
  const audiences: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DispatchLegalDocumentEventUseCase(
      fakePort<INotificationReader>({
        loadBrand: () =>
          Promise.resolve({ name: 'StudioHub', storefrontUrl: 'https://studiohub.vn' } as never),
        loadActivePartnerRecipients: () => {
          audiences.push('partner');
          return Promise.resolve((options.partners ?? [PARTNER]) as never);
        },
        loadActiveAffiliateRecipients: () => {
          audiences.push('affiliate');
          return Promise.resolve((options.affiliates ?? [AFFILIATE]) as never);
        },
      }),
      fakePort<IEmailSender>({
        send: (m) => {
          sent.push(m as unknown as { to: string });
          return Promise.resolve();
        },
      }),
      fakePort<IEmailRenderer>({
        render: (templateId, locale, _brand, data) => {
          rendered.push({ templateId, locale: locale ?? '', data: data as unknown as Record<string, unknown> });
          return Promise.resolve({ subject: 's', text: 't', html: '<p>t</p>' });
        },
      }),
      fakePort<INotificationLogRepository>({
        alreadySent: (k) => {
          dedupeKeys.push(k);
          return Promise.resolve(false);
        },
        record: () => Promise.resolve(),
      }),
      fakePort<INotificationInboxRepository>({ insertMany: () => Promise.resolve() }),
      tenantDb.service,
    ),
    tenantDb,
    sent,
    rendered,
    dedupeKeys,
    audiences,
  };
}

const payload = (overrides: Partial<LegalDocumentPublishedPayload> = {}) =>
  ({
    docType: 'partner_terms',
    versionId: 'version-2',
    versionNo: 2,
    ...overrides,
  }) as LegalDocumentPublishedPayload;

describe('DispatchLegalDocumentEventUseCase', () => {
  it('mails the tenant’s active PARTNERS for partner terms', async () => {
    const { useCase, audiences, sent, rendered } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(audiences).toEqual(['partner']);
    expect(sent.map((s) => s.to)).toEqual([PARTNER.email]);
    expect(rendered[0]?.templateId).toBe('legal_document_published_partner');
  });

  it('mails the AFFILIATES for affiliate terms', async () => {
    const { useCase, audiences, rendered } = harness();

    await useCase.execute(TENANT_ID, payload({ docType: 'affiliate_terms' }));

    expect(audiences).toEqual(['affiliate']);
    expect(rendered[0]?.templateId).toBe('legal_document_published_affiliate');
  });

  it('mails NOBODY for customer terms or the privacy policy', async () => {
    // A tenant can have thousands of customers; they are told at their next
    // checkout instead.
    for (const docType of ['customer_terms', 'privacy_policy', 'made_up'] as const) {
      const { useCase, sent, tenantDb } = harness();

      await useCase.execute(TENANT_ID, payload({ docType }));

      expect(sent).toEqual([]);
      expect(tenantDb.openedFor).toEqual([]);
    }
  });

  it('DEDUPES on the version, not the document type', async () => {
    // Each new material version has to reach everyone again, including people
    // already mailed about a previous version of the same document.
    const { useCase, dedupeKeys } = harness();

    await useCase.execute(TENANT_ID, payload({ versionId: 'version-7' }));

    expect(dedupeKeys).toEqual([
      `legal.document_published:version-7:legal_document_published_partner:${PARTNER.userId}`,
    ]);
  });

  it('links each recipient to the document in THEIR locale', async () => {
    const { useCase, rendered } = harness({
      partners: [PARTNER, { ...PARTNER, userId: 'u2', email: 'b@x.vn', locale: 'en' }],
    });

    await useCase.execute(TENANT_ID, payload());

    expect(rendered.map((r) => r.data.ctaUrl)).toEqual([
      'https://studiohub.vn/vi/legal/dieu-khoan-doi-tac',
      'https://studiohub.vn/en/legal/dieu-khoan-doi-tac',
    ]);
  });

  it('carries the version number so the mail says WHICH version changed', async () => {
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, payload({ versionNo: 5 }));

    expect(rendered[0]?.data).toMatchObject({ legalVersionNo: 5, tenantName: 'StudioHub' });
  });
});
