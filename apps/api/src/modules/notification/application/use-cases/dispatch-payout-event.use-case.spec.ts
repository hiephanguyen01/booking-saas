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
import { DispatchPayoutEventUseCase } from './dispatch-payout-event.use-case';

const TENANT_ID = 'tenant-1';
const STAFF = { userId: 'user-partner', email: 'giang@giangstudio.vn', name: 'Giang', locale: 'vi' };

const context = (): PartnerNotificationContext =>
  ({
    partnerName: 'Studio Giang',
    tenantName: 'StudioHub',
    brand: { dashboardUrl: 'https://admin.studiohub.vn' },
    recipients: [STAFF],
    agreementVersions: [],
  }) as unknown as PartnerNotificationContext;

function harness(ctx: PartnerNotificationContext | null = context()) {
  const sent: Array<{ to: string }> = [];
  const partnerLookups: string[] = [];
  const dedupeKeys: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DispatchPayoutEventUseCase(
      fakePort<INotificationReader>({
        loadPartnerContext: (_tx, id) => {
          partnerLookups.push(id);
          return Promise.resolve(ctx);
        },
      }),
      fakePort<IEmailSender>({
        send: (m) => {
          sent.push(m as unknown as { to: string });
          return Promise.resolve();
        },
      }),
      fakePort<IEmailRenderer>({
        render: () => Promise.resolve({ subject: 's', text: 't', html: '<p>t</p>' }),
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
    partnerLookups,
    dedupeKeys,
  };
}

const payload = (overrides: Record<string, unknown> = {}) => ({
  payoutId: 'payout-1',
  payeeType: 'partner',
  payeeId: 'partner-1',
  amount: '5000000',
  ...overrides,
});

describe('DispatchPayoutEventUseCase', () => {
  it('notifies a PARTNER payee', async () => {
    const { useCase, sent, partnerLookups, tenantDb } = harness();

    await useCase.execute(TENANT_ID, payload());

    // One scope for the context read, one for the bell-row batch.
    expect(tenantDb.openedFor).toEqual([TENANT_ID, TENANT_ID]);
    expect(partnerLookups).toEqual(['partner-1']);
    expect(sent.map((s) => s.to)).toEqual([STAFF.email]);
  });

  it('sends NOTHING for an affiliate payout, and reads no partner', async () => {
    // The affiliate payout has its own path; loading a partner context for an
    // affiliate id would resolve to nothing anyway.
    const { useCase, sent, tenantDb } = harness();

    await useCase.execute(TENANT_ID, payload({ payeeType: 'affiliate' }));

    expect(sent).toEqual([]);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('sends nothing when the partner no longer exists', async () => {
    const { useCase, sent } = harness(null);

    await useCase.execute(TENANT_ID, payload());

    expect(sent).toEqual([]);
  });

  it('dedupes on the PAYOUT, so a redelivery cannot double-notify', async () => {
    const { useCase, dedupeKeys } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(dedupeKeys).toEqual([
      `payout.paid:payout-1:payout_paid_partner:${STAFF.userId}`,
    ]);
  });
});
