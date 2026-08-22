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
import { DispatchPartnerEventUseCase } from './dispatch-partner-event.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const STAFF = { userId: 'user-partner', email: 'giang@x.vn', name: 'Giang', locale: 'vi' };

const context = (overrides: Record<string, unknown> = {}): PartnerNotificationContext =>
  ({
    partnerName: 'Studio Giang',
    tenantName: 'StudioHub',
    brand: { dashboardUrl: 'https://admin.studiohub.vn', storefrontUrl: 'https://studiohub.vn' },
    recipients: [STAFF],
    agreementVersions: ['commission_schedule v2026-01'],
    ...overrides,
  }) as unknown as PartnerNotificationContext;

function harness(ctx: PartnerNotificationContext | null = context()) {
  const rendered: Array<{ templateId: string; data: Record<string, unknown> }> = [];
  const sent: Array<{ to: string }> = [];
  const dedupeKeys: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DispatchPartnerEventUseCase(
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
    tenantDb,
    rendered,
    sent,
    dedupeKeys,
  };
}

describe('DispatchPartnerEventUseCase', () => {
  it('does nothing for an event with no plan, without reading the partner', async () => {
    const { useCase, tenantDb } = harness();

    await useCase.execute(TENANT_ID, 'partner.suspended', { partnerId: PARTNER_ID });

    expect(tenantDb.openedFor).toEqual([]);
  });

  it('sends nothing when the partner no longer exists', async () => {
    const { useCase, sent } = harness(null);

    await useCase.execute(TENANT_ID, 'partner.applied', { partnerId: PARTNER_ID });

    expect(sent).toEqual([]);
  });

  it('sends BOTH the approval and the agreement mail on approval', async () => {
    // The partner is told they are approved, and separately what they are now
    // bound by.
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, 'partner.approved', { partnerId: PARTNER_ID });

    expect(rendered.map((r) => r.templateId)).toEqual([
      'partner_approved',
      'partner_agreement_recorded',
    ]);
  });

  it('points the agreement mail at the AGREEMENTS section, not the dashboard root', async () => {
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, 'partner.approved', { partnerId: PARTNER_ID });

    expect(rendered[0]?.data).toMatchObject({ ctaUrl: 'https://admin.studiohub.vn/partner' });
    expect(rendered[1]?.data).toMatchObject({
      ctaUrl: 'https://admin.studiohub.vn/partner/profile#agreements',
    });
  });

  it('names the agreement VERSIONS the partner accepted', async () => {
    const { useCase, rendered } = harness();

    await useCase.execute(TENANT_ID, 'partner.approved', { partnerId: PARTNER_ID });

    expect(rendered[1]?.data).toMatchObject({
      agreementVersions: 'commission_schedule v2026-01',
    });
  });

  it('omits the versions rather than sending an empty string', async () => {
    const { useCase, rendered } = harness(context({ agreementVersions: [] }));

    await useCase.execute(TENANT_ID, 'partner.approved', { partnerId: PARTNER_ID });

    expect(rendered[0]?.data.agreementVersions).toBeUndefined();
  });

  it('links the terms in the RECIPIENT’s locale', async () => {
    const { useCase, rendered } = harness(
      context({ recipients: [STAFF, { ...STAFF, userId: 'u2', email: 'b@x.vn', locale: 'en' }] }),
    );

    await useCase.execute(TENANT_ID, 'partner.applied', { partnerId: PARTNER_ID });

    expect(rendered.map((r) => r.data.termsUrl)).toEqual([
      'https://studiohub.vn/vi/account/terms',
      'https://studiohub.vn/en/account/terms',
    ]);
  });

  it('dedupes per partner, template and recipient', async () => {
    const { useCase, dedupeKeys } = harness();

    await useCase.execute(TENANT_ID, 'partner.applied', { partnerId: PARTNER_ID });

    expect(dedupeKeys).toEqual([
      `partner.applied:${PARTNER_ID}:partner_application_received:${STAFF.userId}`,
    ]);
  });
});
