import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IEmailRenderer } from '../../domain/ports/email-renderer.port';
import type { IEmailSender } from '../../domain/ports/email-sender.port';
import type { INotificationInboxRepository } from '../../domain/ports/notification-inbox-repository.port';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';
import type {
  INotificationReader,
  PartnerNotificationContext,
} from '../../domain/ports/notification-reader.port';
import {
  DispatchTaxCertificateEventUseCase,
  type TaxCertificateNotificationPayload,
} from './dispatch-tax-certificate-event.use-case';

const TENANT_ID = 'tenant-1';
const STAFF = { userId: 'user-partner', email: 'giang@x.vn', name: 'Giang', locale: 'vi' };

const context = (): PartnerNotificationContext =>
  ({
    partnerName: 'Studio Giang',
    tenantName: 'StudioHub',
    brand: { dashboardUrl: 'https://admin.studiohub.vn/' },
    recipients: [STAFF],
    agreementVersions: [],
  }) as unknown as PartnerNotificationContext;

function harness(ctx: PartnerNotificationContext | null = context()) {
  const rendered: Array<{ templateId: string; data: Record<string, unknown> }> = [];
  const dedupeKeys: string[] = [];
  const sent: Array<{ to: string }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DispatchTaxCertificateEventUseCase(
      fakePort<INotificationReader>({ loadPartnerContext: () => Promise.resolve(ctx) }),
      fakePort<IEmailSender>({
        send: (m) => {
          sent.push(m as unknown as { to: string });
          return Promise.resolve();
        },
      }),
      fakePort<IEmailRenderer>({
        render: (templateId, _locale, _brand, data) => {
          rendered.push({ templateId, data: data as unknown as Record<string, unknown> });
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
    rendered,
    dedupeKeys,
    sent,
  };
}

const payload = (overrides: Partial<TaxCertificateNotificationPayload> = {}) =>
  ({
    partnerId: 'partner-1',
    certificateId: 'cert-1',
    taxYear: 2026,
    certificateNumber: 'CT-2026-0001',
    ...overrides,
  }) as TaxCertificateNotificationPayload;

describe('DispatchTaxCertificateEventUseCase', () => {
  it('sends nothing when the partner no longer exists', async () => {
    const { useCase, sent } = harness(null);

    await useCase.execute(TENANT_ID, 'tax.certificate_issued', payload());

    expect(sent).toEqual([]);
  });

  it('uses a DIFFERENT template for issue and for void', async () => {
    // Telling a partner their certificate was issued when it was voided is the
    // opposite of the truth.
    const issued = harness();
    const voided = harness();

    await issued.useCase.execute(TENANT_ID, 'tax.certificate_issued', payload());
    await voided.useCase.execute(TENANT_ID, 'tax.certificate_voided', payload());

    expect(issued.rendered[0]?.templateId).toBe('tax_certificate_issued_partner');
    expect(voided.rendered[0]?.templateId).toBe('tax_certificate_voided_partner');
  });

  it('dedupes on the certificate AND the event, so both can be sent', async () => {
    const { useCase, dedupeKeys } = harness();

    await useCase.execute(TENANT_ID, 'tax.certificate_voided', payload());

    expect(dedupeKeys).toEqual([
      `tax.certificate_voided:cert-1:tax_certificate_voided_partner:${STAFF.userId}`,
    ]);
  });

  it('carries the tax year, the number and the void reason', async () => {
    const { useCase, rendered } = harness();

    await useCase.execute(
      TENANT_ID,
      'tax.certificate_voided',
      payload({ reason: 'Sai số tiền' }),
    );

    expect(rendered[0]?.data).toMatchObject({
      taxYear: 2026,
      certificateNumber: 'CT-2026-0001',
      reason: 'Sai số tiền',
      partnerName: 'Studio Giang',
    });
  });

  it('shows a dash when the certificate has no number yet', async () => {
    // An empty field would render as a blank line the partner cannot interpret.
    const { useCase, rendered } = harness();

    await useCase.execute(
      TENANT_ID,
      'tax.certificate_issued',
      payload({ certificateNumber: null }),
    );

    expect(rendered[0]?.data).toMatchObject({ certificateNumber: '—' });
  });

  it('builds the revenue link without a double slash', async () => {
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, 'tax.certificate_issued', payload());

    expect(rendered[0]?.data).toMatchObject({
      ctaUrl: 'https://admin.studiohub.vn/partner/revenue',
    });
  });
});
